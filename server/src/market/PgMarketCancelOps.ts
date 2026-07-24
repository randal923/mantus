import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { appendBankLedger } from "../economy/appendBankLedger";
import { creditBankBalance } from "../economy/creditBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { parseBalance } from "../economy/parseBalance";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { selectBankBalanceQuery } from "../economy/sql/selectBankBalanceQuery";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { LockedMarketOffer, MarketTxHelper } from "./MarketTxHelper";
import type {
  CancelOfferRequest,
  CancelOfferResult,
  ExpiredOfferResult,
} from "./MarketStore";
import { deleteMarketEscrowItemQuery } from "./sql/deleteMarketEscrowItemQuery";
import { deleteMarketOfferQuery } from "./sql/deleteMarketOfferQuery";
import { expiredOfferIdsQuery } from "./sql/expiredOfferIdsQuery";
import { extendOfferExpiryUpdate } from "./sql/extendOfferExpiryUpdate";
import { lockEscrowRowsForOfferQuery } from "./sql/lockEscrowRowsForOfferQuery";

const EXPIRY_RETRY_MS = 60 * 60 * 1000;

export class PgMarketCancelOps {
  constructor(
    private readonly pool: Pool,
    private readonly helper: MarketTxHelper,
  ) {}

  cancelOffer(request: CancelOfferRequest): Promise<CancelOfferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const isNew = await this.helper.beginRequest(
        client,
        request.requestId,
        request.characterId,
        "cancel",
      );
      if (!isNew) {
        throw new TransactionRollback<CancelOfferResult>({
          status: "duplicate-request",
        });
      }
      await this.helper.lockCharacter(client, request.characterId);
      const offer = await this.helper.lockOffer(client, request.offerId);
      // A foreign offer reports not-found so probing ids leaks nothing.
      if (!offer || offer.characterId !== request.characterId) {
        throw new TransactionRollback<CancelOfferResult>({
          status: "offer-not-found",
        });
      }
      const resolved = await this.resolve<CancelOfferResult>(
        client,
        offer,
        "cancelled",
        { status: "inbox-full" },
        { status: "balance-limit" },
      );
      return {
        status: "committed",
        offerId: offer.id,
        side: offer.side,
        itemTypeId: offer.itemTypeId,
        remainingAmount: offer.remainingAmount,
        unitPrice: offer.unitPrice,
        refund: resolved.refund,
        balance: resolved.balance,
        returnedItems: resolved.returnedItems,
      };
    });
  }

  /** Resolves due offers one commit at a time; a full inbox defers the offer. */
  async resolveExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredOfferResult>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("expired market offer batch is out of range");
    }
    const due = await this.pool.query<{ id: string }>(expiredOfferIdsQuery, [
      now,
      limit,
    ]);
    const results: ExpiredOfferResult[] = [];
    for (const candidate of due.rows) {
      const result = await runSerializableTransaction<ExpiredOfferResult | null>(
        this.pool,
        async (client) => {
          const offer = await this.helper.lockOffer(client, candidate.id);
          if (!offer || offer.expiresAt.getTime() > now.getTime()) return null;
          try {
            const resolved = await this.resolve<null>(
              client,
              offer,
              "expired",
              null,
              null,
            );
            return {
              offerId: offer.id,
              characterId: offer.characterId,
              side: offer.side,
              itemTypeId: offer.itemTypeId,
              remainingAmount: offer.remainingAmount,
              refund: resolved.refund,
              returnedItems: resolved.returnedItems,
            };
          } catch (cause) {
            if (cause instanceof TransactionRollback) {
              // Recipient inbox or balance is full: push expiry out and retry.
              await client.query(extendOfferExpiryUpdate, [
                offer.id,
                new Date(now.getTime() + EXPIRY_RETRY_MS),
              ]);
              return null;
            }
            throw cause;
          }
        },
      );
      if (result) results.push(result);
    }
    return results;
  }

  /** Returns escrow to the owner and records history/audit; caller commits. */
  private async resolve<T>(
    client: PoolClient,
    offer: LockedMarketOffer,
    state: "cancelled" | "expired",
    inboxFullResult: T,
    balanceLimitResult: T,
  ): Promise<{
    refund: number;
    balance: number;
    returnedItems: ReadonlyArray<Item>;
  }> {
    let refund = 0;
    let balance = 0;
    let returnedItems: ReadonlyArray<Item> = [];
    if (offer.side === "buy") {
      refund = offer.escrowBalance;
      const before = await lockBankBalance(client, offer.characterId);
      if (before + refund > BANK_LIMITS.maxBalance) {
        throw new TransactionRollback<T>(balanceLimitResult);
      }
      balance = await creditBankBalance(client, offer.characterId, refund);
      await appendBankLedger(
        client,
        offer.characterId,
        "market-refund",
        refund,
        balance,
      );
    } else {
      const escrowRows = await client.query<DepotItemRow>(
        lockEscrowRowsForOfferQuery,
        [offer.id],
      );
      const totalEscrowed = escrowRows.rows.reduce(
        (total, row) => total + row.count,
        0,
      );
      if (totalEscrowed !== offer.remainingAmount) {
        throw new Error(
          `market offer ${offer.id} escrow does not match its remaining amount`,
        );
      }
      const movements = escrowRows.rows.map((row) => ({
        row,
        take: row.count,
      }));
      const delivery = await this.helper.deliverToInbox<T>(
        client,
        offer.characterId,
        movements,
        offer.characterId,
        state === "cancelled" ? "market-cancel" : "market-expiry",
        inboxFullResult,
      );
      if (delivery.removedItemIds.length > 0) {
        await client.query(deleteMarketEscrowItemQuery, [
          delivery.removedItemIds,
        ]);
      }
      returnedItems = delivery.delivered;
      await client.query(bumpInboxRevisionUpdate, [offer.characterId]);
      const balanceResult = await client.query<{ balance: string }>(
        selectBankBalanceQuery,
        [offer.characterId],
      );
      const balanceRow = balanceResult.rows[0];
      balance = balanceRow ? parseBalance(balanceRow.balance) : 0;
    }
    await client.query(deleteMarketOfferQuery, [offer.id]);
    await this.helper.appendHistory(
      client,
      offer.id,
      offer.characterId,
      "creator",
      offer.side,
      offer.itemTypeId,
      offer.remainingAmount,
      offer.unitPrice,
      state,
    );
    await this.helper.appendAudit(
      client,
      state === "cancelled" ? "market-offer-cancelled" : "market-offer-expired",
      offer.characterId,
      {
        offerId: offer.id,
        side: offer.side,
        itemTypeId: offer.itemTypeId,
        remainingAmount: offer.remainingAmount,
        unitPrice: offer.unitPrice,
        refund,
      },
    );
    return { refund, balance, returnedItems };
  }
}
