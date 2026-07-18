import { MARKET_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { itemFromRow } from "../depot/itemFromRow";
import { requireItem } from "../depot/requireItem";
import { depositDepotRevisionUpdate } from "../depot/sql/depositDepotRevisionUpdate";
import { appendBankLedger } from "../economy/appendBankLedger";
import { debitBankBalance } from "../economy/debitBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { ItemCatalog } from "../item/ItemCatalog";
import { marketCategoryOf } from "./marketCategoryOf";
import type { MarketTxHelper } from "./MarketTxHelper";
import type {
  CreateBuyOfferRequest,
  CreateOfferResult,
  CreateSellOfferRequest,
} from "./MarketStore";
import { childExistsQuery } from "./sql/childExistsQuery";
import { countActiveOffersQuery } from "./sql/countActiveOffersQuery";
import { countEscrowRowsQuery } from "./sql/countEscrowRowsQuery";
import { insertMarketEscrowItemQuery } from "./sql/insertMarketEscrowItemQuery";
import { insertMarketOfferQuery } from "./sql/insertMarketOfferQuery";
import { insertSlottedItemQuery } from "./sql/insertSlottedItemQuery";
import { insertItemSplitAudit } from "../item/sql/insertItemSplitAudit";
import { marketFreeSlotsQuery } from "./sql/marketFreeSlotsQuery";
import { moveItemToEscrowUpdate } from "./sql/moveItemToEscrowUpdate";
import { reduceItemCountUpdate } from "./sql/reduceItemCountUpdate";
import { randomUUID } from "node:crypto";
import type { Item } from "../item/Item";

type Rollback = TransactionRollback<CreateOfferResult>;

export class PgMarketCreateOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: MarketTxHelper,
  ) {}

  createSellOffer(request: CreateSellOfferRequest): Promise<CreateOfferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const accountId = await this.begin(client, request.requestId, request);
      await this.requireOfferCapacity(client, request.characterId);
      const type = this.catalog.get(request.itemTypeId);
      if (!type || marketCategoryOf(type) === null) {
        throw this.fail("invalid-item");
      }
      const escrowCount = await client.query<{ count: number }>(
        countEscrowRowsQuery,
        [request.characterId],
      );
      const existingEscrow = escrowCount.rows[0]?.count ?? 0;
      if (
        existingEscrow + request.sources.length >
        MARKET_LIMITS.maxEscrowItemsPerCharacter
      ) {
        throw this.fail("escrow-full");
      }
      const balance = await this.chargeFee(client, request);

      const sorted = [...request.sources].sort((a, b) =>
        a.itemId < b.itemId ? -1 : 1,
      );
      let coveredAmount = 0;
      const lockedRows: Array<{ row: DepotItemRow; take: number }> = [];
      for (const source of sorted) {
        const row = await this.helper.depot.lockItem(client, source.itemId);
        if (!row || row.version !== source.itemRevision) {
          throw this.fail("not-owned");
        }
        if (
          row.location_type !== "depot" ||
          row.character_id !== request.characterId ||
          row.depot_id === null ||
          row.item_type_id !== request.itemTypeId
        ) {
          throw this.fail("not-owned");
        }
        if (!this.isPristine(row)) throw this.fail("invalid-item");
        const children = await client.query(childExistsQuery, [row.id]);
        if (children.rows.length > 0) throw this.fail("invalid-item");
        if (source.take < 1 || source.take > row.count) {
          throw this.fail("insufficient-items");
        }
        coveredAmount += source.take;
        lockedRows.push({ row, take: source.take });
      }
      if (coveredAmount !== request.amount) {
        throw this.fail("insufficient-items");
      }

      const slots = await client.query<{ slot: number }>(marketFreeSlotsQuery, [
        request.characterId,
        "market-escrow",
        MARKET_LIMITS.maxEscrowItemsPerCharacter,
        lockedRows.length,
      ]);
      if (slots.rows.length < lockedRows.length) throw this.fail("escrow-full");

      const offer = await client.query<{ id: string; expires_at: Date }>(
        insertMarketOfferQuery,
        [
          request.characterId,
          accountId,
          "sell",
          request.itemTypeId,
          request.amount,
          request.unitPrice,
          request.fee,
          0,
          MARKET_LIMITS.offerDurationDays,
        ],
      );
      const offerRow = offer.rows[0];
      if (!offerRow) throw new Error("market offer insert returned no row");

      const depotUpserts: Item[] = [];
      const removedItemIds: string[] = [];
      for (const [index, locked] of lockedRows.entries()) {
        const slot = slots.rows[index]?.slot;
        if (slot === undefined) throw new Error("market escrow slot is missing");
        const escrowItemId = await this.escrowRow(
          client,
          request.characterId,
          locked.row,
          locked.take,
          slot,
          depotUpserts,
          removedItemIds,
        );
        await client.query(insertMarketEscrowItemQuery, [
          escrowItemId,
          offerRow.id,
        ]);
      }
      const sourceDepotIds = [
        ...new Set(
          lockedRows.flatMap((locked) =>
            locked.row.depot_id === null ? [] : [locked.row.depot_id],
          ),
        ),
      ];
      for (const depotId of sourceDepotIds) {
        await client.query(depositDepotRevisionUpdate, [
          request.characterId,
          depotId,
        ]);
      }
      await this.helper.appendAudit(client, "market-offer-created", request.characterId, {
        offerId: offerRow.id,
        side: "sell",
        itemTypeId: request.itemTypeId,
        amount: request.amount,
        unitPrice: request.unitPrice,
        totalPrice: request.totalPrice,
        fee: request.fee,
        escrowItems: lockedRows.length,
      });
      return {
        status: "committed",
        offerId: offerRow.id,
        expiresAt: offerRow.expires_at,
        balance,
        depotUpserts,
        removedItemIds,
        sourceDepotIds,
      };
    });
  }

  createBuyOffer(request: CreateBuyOfferRequest): Promise<CreateOfferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const accountId = await this.begin(client, request.requestId, request);
      await this.requireOfferCapacity(client, request.characterId);
      const type = this.catalog.get(request.itemTypeId);
      if (!type || marketCategoryOf(type) === null) {
        throw this.fail("invalid-item");
      }
      const balance = await lockBankBalance(client, request.characterId);
      if (balance < request.fee + request.totalPrice) {
        throw this.fail("insufficient-funds");
      }
      const afterFee = await debitBankBalance(
        client,
        request.characterId,
        request.fee,
      );
      await appendBankLedger(
        client,
        request.characterId,
        "market-fee",
        request.fee,
        afterFee,
      );
      const afterEscrow = await debitBankBalance(
        client,
        request.characterId,
        request.totalPrice,
      );
      await appendBankLedger(
        client,
        request.characterId,
        "market-escrow",
        request.totalPrice,
        afterEscrow,
      );
      const offer = await client.query<{ id: string; expires_at: Date }>(
        insertMarketOfferQuery,
        [
          request.characterId,
          accountId,
          "buy",
          request.itemTypeId,
          request.amount,
          request.unitPrice,
          request.fee,
          request.totalPrice,
          MARKET_LIMITS.offerDurationDays,
        ],
      );
      const offerRow = offer.rows[0];
      if (!offerRow) throw new Error("market offer insert returned no row");
      await this.helper.appendAudit(client, "market-offer-created", request.characterId, {
        offerId: offerRow.id,
        side: "buy",
        itemTypeId: request.itemTypeId,
        amount: request.amount,
        unitPrice: request.unitPrice,
        totalPrice: request.totalPrice,
        fee: request.fee,
      });
      return {
        status: "committed",
        offerId: offerRow.id,
        expiresAt: offerRow.expires_at,
        balance: afterEscrow,
        depotUpserts: [],
        removedItemIds: [],
        sourceDepotIds: [],
      };
    });
  }

  private async begin(
    client: PoolClient,
    requestId: string,
    request: { characterId: string },
  ): Promise<string> {
    const isNew = await this.helper.beginRequest(
      client,
      requestId,
      request.characterId,
      "create",
    );
    if (!isNew) throw this.fail("duplicate-request");
    const { accountId } = await this.helper.lockCharacter(
      client,
      request.characterId,
    );
    return accountId;
  }

  private async requireOfferCapacity(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    const count = await client.query<{ count: number }>(
      countActiveOffersQuery,
      [characterId],
    );
    if ((count.rows[0]?.count ?? 0) >= MARKET_LIMITS.maxActiveOffersPerCharacter) {
      throw this.fail("offer-limit");
    }
  }

  /** Fee comes from the bank only; carried coins never enter market math. */
  private async chargeFee(
    client: PoolClient,
    request: CreateSellOfferRequest,
  ): Promise<number> {
    const balance = await lockBankBalance(client, request.characterId);
    if (balance < request.fee) throw this.fail("insufficient-funds");
    const after = await debitBankBalance(
      client,
      request.characterId,
      request.fee,
    );
    await appendBankLedger(
      client,
      request.characterId,
      "market-fee",
      request.fee,
      after,
    );
    return after;
  }

  private async escrowRow(
    client: PoolClient,
    characterId: string,
    row: DepotItemRow,
    take: number,
    slot: number,
    depotUpserts: Item[],
    removedItemIds: string[],
  ): Promise<string> {
    if (take === row.count) {
      const before = itemFromRow(row);
      const moved = await client.query<DepotItemRow>(moveItemToEscrowUpdate, [
        row.id,
        slot,
      ]);
      const after = requireItem(moved.rows[0]);
      removedItemIds.push(row.id);
      await this.helper.depot.auditTransfer(
        client,
        characterId,
        before,
        after,
        "market-escrow",
      );
      return after.id;
    }
    const reduced = await client.query<DepotItemRow>(reduceItemCountUpdate, [
      row.id,
      take,
    ]);
    const reducedRow = reduced.rows[0];
    if (!reducedRow) throw new Error("market escrow split source is missing");
    depotUpserts.push(itemFromRow(reducedRow));
    const created = await client.query<DepotItemRow>(insertSlottedItemQuery, [
      randomUUID(),
      row.item_type_id,
      take,
      "market-escrow",
      characterId,
      slot,
    ]);
    const after = requireItem(created.rows[0]);
    await client.query(insertItemSplitAudit, [
      characterId,
      row.id,
      JSON.stringify({
        operation: "market-escrow",
        newItemId: after.id,
        count: take,
      }),
    ]);
    return after.id;
  }

  private isPristine(row: DepotItemRow): boolean {
    return (
      typeof row.attributes === "object" &&
      row.attributes !== null &&
      Object.keys(row.attributes).length === 0
    );
  }

  private fail(status: Exclude<CreateOfferResult["status"], "committed">): Rollback {
    return new TransactionRollback<CreateOfferResult>({ status });
  }
}
