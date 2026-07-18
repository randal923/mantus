import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import type { PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { DepotTxHelper } from "../depot/DepotTxHelper";
import { itemFromRow } from "../depot/itemFromRow";
import { requireItem } from "../depot/requireItem";
import { mailItemToInboxUpdate } from "../depot/sql/mailItemToInboxUpdate";
import { parseBalance } from "../economy/parseBalance";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { MarketOfferRow } from "./MarketOfferRow";
import { insertMarketAuditQuery } from "./sql/insertMarketAuditQuery";
import { insertMarketHistoryQuery } from "./sql/insertMarketHistoryQuery";
import { insertMarketRequestQuery } from "./sql/insertMarketRequestQuery";
import { insertSlottedItemQuery } from "./sql/insertSlottedItemQuery";
import { insertItemSplitAudit } from "../item/sql/insertItemSplitAudit";
import { lockMarketCharacterQuery } from "./sql/lockMarketCharacterQuery";
import { lockMarketOfferQuery } from "./sql/lockMarketOfferQuery";
import { marketFreeSlotsQuery } from "./sql/marketFreeSlotsQuery";
import { reduceItemCountUpdate } from "./sql/reduceItemCountUpdate";

export interface LockedMarketOffer {
  readonly id: string;
  readonly characterId: string;
  readonly accountId: string;
  readonly side: "buy" | "sell";
  readonly itemTypeId: number;
  readonly amount: number;
  readonly remainingAmount: number;
  readonly unitPrice: number;
  readonly feePaid: number;
  readonly escrowBalance: number;
  readonly expiresAt: Date;
}

export interface InboxMovement {
  readonly row: DepotItemRow;
  readonly take: number;
}

export interface InboxDeliveryOutcome {
  readonly delivered: ReadonlyArray<Item>;
  /** Source rows that were reduced by a split, as stored after the commit. */
  readonly sourceUpserts: ReadonlyArray<Item>;
  /** Source rows moved wholly into the inbox. */
  readonly removedItemIds: ReadonlyArray<string>;
}

/** Shared transaction steps for market operations. */
export class MarketTxHelper {
  readonly depot = new DepotTxHelper();

  /** Replay guard: false means this requestId was already consumed. */
  async beginRequest(
    client: PoolClient,
    requestId: string,
    characterId: string,
    kind: "create" | "accept" | "cancel",
  ): Promise<boolean> {
    const inserted = await client.query(insertMarketRequestQuery, [
      requestId,
      characterId,
      kind,
    ]);
    return inserted.rows.length === 1;
  }

  /** Locks the character row (per-character serialization anchor). */
  async lockCharacter(
    client: PoolClient,
    characterId: string,
  ): Promise<{ accountId: string }> {
    const result = await client.query<{ id: string; account_id: string }>(
      lockMarketCharacterQuery,
      [characterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("market character is missing");
    return { accountId: row.account_id };
  }

  async lockOffer(
    client: PoolClient,
    offerId: string,
  ): Promise<LockedMarketOffer | null> {
    const result = await client.query<MarketOfferRow>(lockMarketOfferQuery, [
      offerId,
    ]);
    const row = result.rows[0];
    return row ? this.offerFromRow(row) : null;
  }

  offerFromRow(row: MarketOfferRow): LockedMarketOffer {
    return {
      id: row.id,
      characterId: row.character_id,
      accountId: row.account_id,
      side: row.side,
      itemTypeId: row.item_type_id,
      amount: row.amount,
      remainingAmount: row.remaining_amount,
      unitPrice: parseBalance(row.unit_price),
      feePaid: parseBalance(row.fee_paid),
      escrowBalance: parseBalance(row.escrow_balance),
      expiresAt: row.expires_at,
    };
  }

  /**
   * Moves the given (already locked) rows into the recipient's inbox, moving
   * whole rows and splitting at most per-row remainders. Rolls back with
   * `rollbackStatus` when the inbox cannot hold the new rows.
   */
  async deliverToInbox<T>(
    client: PoolClient,
    recipientCharacterId: string,
    movements: ReadonlyArray<InboxMovement>,
    auditCharacterId: string,
    auditOperation: string,
    rollbackResult: T,
  ): Promise<InboxDeliveryOutcome> {
    await this.depot.ensureStorageState(client, recipientCharacterId);
    const inboxCount = await this.depot.heldItemCount(
      client,
      recipientCharacterId,
      "inbox",
    );
    if (inboxCount + movements.length > DEPOT_LIMITS.maxInboxItems) {
      throw new TransactionRollback<T>(rollbackResult);
    }
    const slots = await client.query<{ slot: number }>(marketFreeSlotsQuery, [
      recipientCharacterId,
      "inbox",
      DEPOT_LIMITS.maxInboxItems,
      movements.length,
    ]);
    if (slots.rows.length < movements.length) {
      throw new TransactionRollback<T>(rollbackResult);
    }
    const delivered: Item[] = [];
    const sourceUpserts: Item[] = [];
    const removedItemIds: string[] = [];
    for (const [index, movement] of movements.entries()) {
      const slot = slots.rows[index]?.slot;
      if (slot === undefined) throw new Error("market inbox slot is missing");
      if (movement.take === movement.row.count) {
        const before = itemFromRow(movement.row);
        const moved = await client.query<DepotItemRow>(mailItemToInboxUpdate, [
          movement.row.id,
          recipientCharacterId,
          slot,
        ]);
        const after = requireItem(moved.rows[0]);
        delivered.push(after);
        removedItemIds.push(movement.row.id);
        await this.depot.auditTransfer(
          client,
          auditCharacterId,
          before,
          after,
          auditOperation,
        );
        continue;
      }
      const reduced = await client.query<DepotItemRow>(reduceItemCountUpdate, [
        movement.row.id,
        movement.take,
      ]);
      const reducedRow = reduced.rows[0];
      if (!reducedRow) throw new Error("market split source is missing");
      sourceUpserts.push(itemFromRow(reducedRow));
      const created = await client.query<DepotItemRow>(insertSlottedItemQuery, [
        randomUUID(),
        movement.row.item_type_id,
        movement.take,
        "inbox",
        recipientCharacterId,
        slot,
      ]);
      const after = requireItem(created.rows[0]);
      delivered.push(after);
      await client.query(insertItemSplitAudit, [
        auditCharacterId,
        movement.row.id,
        JSON.stringify({
          operation: auditOperation,
          newItemId: after.id,
          count: movement.take,
        }),
      ]);
    }
    return { delivered, sourceUpserts, removedItemIds };
  }

  /** Chooses which locked rows cover `amount`, splitting at most the last. */
  planMovements(
    rows: ReadonlyArray<DepotItemRow>,
    amount: number,
  ): ReadonlyArray<InboxMovement> | null {
    const movements: InboxMovement[] = [];
    let remaining = amount;
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(row.count, remaining);
      movements.push({ row, take });
      remaining -= take;
    }
    return remaining > 0 ? null : movements;
  }

  async appendHistory(
    client: PoolClient,
    offerId: string,
    characterId: string,
    role: "creator" | "acceptor",
    side: "buy" | "sell",
    itemTypeId: number,
    amount: number,
    unitPrice: number,
    state: "accepted" | "cancelled" | "expired",
  ): Promise<void> {
    await client.query(insertMarketHistoryQuery, [
      offerId,
      characterId,
      role,
      side,
      itemTypeId,
      amount,
      unitPrice,
      state,
    ]);
  }

  async appendAudit(
    client: PoolClient,
    eventType:
      | "market-offer-created"
      | "market-offer-accepted"
      | "market-offer-cancelled"
      | "market-offer-expired",
    characterId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(insertMarketAuditQuery, [
      eventType,
      characterId,
      JSON.stringify(details),
    ]);
  }
}
