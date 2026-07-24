import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { depositDepotRevisionUpdate } from "../depot/sql/depositDepotRevisionUpdate";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { appendBankLedger } from "../economy/appendBankLedger";
import { creditBankBalance } from "../economy/creditBankBalance";
import { debitBankBalance } from "../economy/debitBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { parseBalance } from "../economy/parseBalance";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { insertBankAccountPairQuery } from "../economy/sql/insertBankAccountPairQuery";
import { lockBankAccountPairQuery } from "../economy/sql/lockBankAccountPairQuery";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { ItemCatalog } from "../item/ItemCatalog";
import { monotonicNow } from "../monotonicNow";
import { marketTotalOf } from "./marketTotalOf";
import { spendMarketFunds } from "./spendMarketFunds";
import type { LockedMarketOffer, MarketTxHelper } from "./MarketTxHelper";
import type {
  AcceptBuyOfferRequest,
  AcceptOfferResult,
  AcceptSellOfferRequest,
} from "./MarketStore";
import { childExistsQuery } from "./sql/childExistsQuery";
import { deleteMarketEscrowItemQuery } from "./sql/deleteMarketEscrowItemQuery";
import { deleteMarketOfferQuery } from "./sql/deleteMarketOfferQuery";
import { lockEscrowRowsForOfferQuery } from "./sql/lockEscrowRowsForOfferQuery";
import { updateMarketOfferFillQuery } from "./sql/updateMarketOfferFillQuery";

type Rollback = TransactionRollback<AcceptOfferResult>;

export class PgMarketAcceptOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: MarketTxHelper,
  ) {}

  /** A buyer takes (part of) a sell offer: money buyer→seller, escrow→inbox. */
  acceptSellOffer(request: AcceptSellOfferRequest): Promise<AcceptOfferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const { accountId } = await this.begin(
        client,
        request.requestId,
        request.buyerCharacterId,
      );
      const offer = await this.lockActiveOffer(client, request.offerId, "sell");
      this.requireCounterparty(offer, request.buyerCharacterId, accountId);
      const totalPrice = this.fillTotal(offer, request.amount);

      await client.query(insertBankAccountPairQuery, [
        request.buyerCharacterId,
        offer.characterId,
      ]);
      const locked = await client.query<{
        character_id: string;
        balance: string;
      }>(lockBankAccountPairQuery, [
        request.buyerCharacterId,
        offer.characterId,
      ]);
      const balances = new Map(
        locked.rows.map((row) => [row.character_id, parseBalance(row.balance)]),
      );
      const buyerBalance = balances.get(request.buyerCharacterId);
      const sellerBalance = balances.get(offer.characterId);
      if (buyerBalance === undefined || sellerBalance === undefined) {
        throw new Error("market accept accounts are missing");
      }
      if (sellerBalance + totalPrice > BANK_LIMITS.maxBalance) {
        throw this.fail("balance-limit");
      }
      // Buyer pays carried-coins-first with bank fallback (Canary order).
      const spend = await spendMarketFunds(
        client,
        request.buyerCharacterId,
        this.catalog,
        totalPrice,
      );
      if (spend.status !== "ok") throw this.fail(spend.status);

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
      const movements = this.helper.planMovements(
        escrowRows.rows,
        request.amount,
      );
      if (!movements) throw this.fail("amount-too-large");
      const delivery = await this.helper.deliverToInbox<AcceptOfferResult>(
        client,
        request.buyerCharacterId,
        movements,
        request.buyerCharacterId,
        "market-fill",
        { status: "inbox-full" },
      );
      if (delivery.removedItemIds.length > 0) {
        await client.query(deleteMarketEscrowItemQuery, [
          delivery.removedItemIds,
        ]);
      }

      let buyerAfter = buyerBalance;
      if (spend.bankPaid > 0) {
        buyerAfter = await debitBankBalance(
          client,
          request.buyerCharacterId,
          spend.bankPaid,
        );
        await appendBankLedger(
          client,
          request.buyerCharacterId,
          "market-purchase",
          spend.bankPaid,
          buyerAfter,
          offer.characterId,
        );
      }
      const sellerAfter = await creditBankBalance(
        client,
        offer.characterId,
        totalPrice,
      );
      await appendBankLedger(
        client,
        offer.characterId,
        "market-sale",
        totalPrice,
        sellerAfter,
        request.buyerCharacterId,
      );

      await this.settleOfferFill(client, offer, request.amount, 0);
      await client.query(bumpInboxRevisionUpdate, [request.buyerCharacterId]);
      await this.recordFill(
        client,
        offer,
        request.buyerCharacterId,
        request.amount,
        totalPrice,
      );
      const coinMutation =
        spend.after.size > 0 || spend.removedItemIds.length > 0
          ? {
              after: [...spend.after.values()],
              removedItemIds: spend.removedItemIds,
            }
          : undefined;
      return {
        status: "committed",
        offerId: offer.id,
        itemTypeId: offer.itemTypeId,
        amount: request.amount,
        unitPrice: offer.unitPrice,
        totalPrice,
        balance: buyerAfter,
        counterpartyCharacterId: offer.characterId,
        deliveredItems: delivery.delivered,
        deliveredCharacterId: request.buyerCharacterId,
        depotUpserts: [],
        removedItemIds: [],
        sourceDepotIds: [],
        ...(coinMutation ? { mutation: coinMutation } : {}),
      };
    });
  }

  /** A seller fills (part of) a buy offer: depot items→creator inbox, escrowed money→seller. */
  acceptBuyOffer(request: AcceptBuyOfferRequest): Promise<AcceptOfferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const { accountId } = await this.begin(
        client,
        request.requestId,
        request.sellerCharacterId,
      );
      const offer = await this.lockActiveOffer(client, request.offerId, "buy");
      this.requireCounterparty(offer, request.sellerCharacterId, accountId);
      const totalPrice = this.fillTotal(offer, request.amount);
      if (offer.escrowBalance < totalPrice) {
        throw new Error(
          `market offer ${offer.id} escrow balance is below its fill total`,
        );
      }

      const sorted = [...request.sources].sort((a, b) =>
        a.itemId < b.itemId ? -1 : 1,
      );
      let coveredAmount = 0;
      const rows: Array<{ row: DepotItemRow; take: number }> = [];
      for (const source of sorted) {
        const row = await this.helper.depot.lockItem(client, source.itemId);
        if (!row || row.version !== source.itemRevision) {
          throw this.fail("not-owned");
        }
        if (
          row.location_type !== "depot" ||
          row.character_id !== request.sellerCharacterId ||
          row.depot_id === null ||
          row.item_type_id !== offer.itemTypeId
        ) {
          throw this.fail("not-owned");
        }
        if (
          typeof row.attributes !== "object" ||
          row.attributes === null ||
          Object.keys(row.attributes).length > 0
        ) {
          throw this.fail("invalid-item");
        }
        const children = await client.query(childExistsQuery, [row.id]);
        if (children.rows.length > 0) throw this.fail("invalid-item");
        if (source.take < 1 || source.take > row.count) {
          throw this.fail("insufficient-items");
        }
        coveredAmount += source.take;
        rows.push({ row, take: source.take });
      }
      if (coveredAmount !== request.amount) {
        throw this.fail("insufficient-items");
      }

      const delivery = await this.helper.deliverToInbox<AcceptOfferResult>(
        client,
        offer.characterId,
        rows,
        request.sellerCharacterId,
        "market-fill",
        { status: "inbox-full" },
      );

      const sellerBefore = await lockBankBalance(
        client,
        request.sellerCharacterId,
      );
      if (sellerBefore + totalPrice > BANK_LIMITS.maxBalance) {
        throw this.fail("balance-limit");
      }
      const sellerAfter = await creditBankBalance(
        client,
        request.sellerCharacterId,
        totalPrice,
      );
      await appendBankLedger(
        client,
        request.sellerCharacterId,
        "market-sale",
        totalPrice,
        sellerAfter,
        offer.characterId,
      );

      await this.settleOfferFill(client, offer, request.amount, totalPrice);
      await client.query(bumpInboxRevisionUpdate, [offer.characterId]);
      const sourceDepotIds = [
        ...new Set(
          rows.flatMap((locked) =>
            locked.row.depot_id === null ? [] : [locked.row.depot_id],
          ),
        ),
      ];
      for (const depotId of sourceDepotIds) {
        await client.query(depositDepotRevisionUpdate, [
          request.sellerCharacterId,
          depotId,
        ]);
      }
      await this.recordFill(
        client,
        offer,
        request.sellerCharacterId,
        request.amount,
        totalPrice,
      );
      return {
        status: "committed",
        offerId: offer.id,
        itemTypeId: offer.itemTypeId,
        amount: request.amount,
        unitPrice: offer.unitPrice,
        totalPrice,
        balance: sellerAfter,
        counterpartyCharacterId: offer.characterId,
        deliveredItems: delivery.delivered,
        deliveredCharacterId: offer.characterId,
        depotUpserts: delivery.sourceUpserts,
        removedItemIds: delivery.removedItemIds,
        sourceDepotIds,
      };
    });
  }

  private async begin(
    client: PoolClient,
    requestId: string,
    characterId: string,
  ): Promise<{ accountId: string }> {
    const isNew = await this.helper.beginRequest(
      client,
      requestId,
      characterId,
      "accept",
    );
    if (!isNew) throw this.fail("duplicate-request");
    return this.helper.lockCharacter(client, characterId);
  }

  private async lockActiveOffer(
    client: PoolClient,
    offerId: string,
    side: "buy" | "sell",
  ): Promise<LockedMarketOffer> {
    const offer = await this.helper.lockOffer(client, offerId);
    if (!offer || offer.side !== side) throw this.fail("offer-not-found");
    if (offer.expiresAt.getTime() <= monotonicNow()) {
      throw this.fail("offer-not-found");
    }
    return offer;
  }

  private requireCounterparty(
    offer: LockedMarketOffer,
    characterId: string,
    accountId: string,
  ): void {
    if (offer.characterId === characterId || offer.accountId === accountId) {
      throw this.fail("own-offer");
    }
  }

  private fillTotal(offer: LockedMarketOffer, amount: number): number {
    if (amount > offer.remainingAmount) throw this.fail("amount-too-large");
    const totalPrice = marketTotalOf(amount, offer.unitPrice);
    if (totalPrice === null) throw this.fail("amount-too-large");
    return totalPrice;
  }

  /** Decrements or deletes the offer once its legs are settled. */
  private async settleOfferFill(
    client: PoolClient,
    offer: LockedMarketOffer,
    amount: number,
    escrowSpent: number,
  ): Promise<void> {
    if (amount === offer.remainingAmount) {
      await client.query(deleteMarketOfferQuery, [offer.id]);
      return;
    }
    const updated = await client.query(updateMarketOfferFillQuery, [
      offer.id,
      amount,
      escrowSpent,
    ]);
    if (updated.rows.length !== 1) {
      throw new Error(`market offer ${offer.id} fill update failed`);
    }
  }

  private async recordFill(
    client: PoolClient,
    offer: LockedMarketOffer,
    acceptorCharacterId: string,
    amount: number,
    totalPrice: number,
  ): Promise<void> {
    const acceptorSide = offer.side === "sell" ? "buy" : "sell";
    await this.helper.appendHistory(
      client,
      offer.id,
      offer.characterId,
      "creator",
      offer.side,
      offer.itemTypeId,
      amount,
      offer.unitPrice,
      "accepted",
    );
    await this.helper.appendHistory(
      client,
      offer.id,
      acceptorCharacterId,
      "acceptor",
      acceptorSide,
      offer.itemTypeId,
      amount,
      offer.unitPrice,
      "accepted",
    );
    await this.helper.appendAudit(
      client,
      "market-offer-accepted",
      acceptorCharacterId,
      {
        offerId: offer.id,
        creatorCharacterId: offer.characterId,
        side: offer.side,
        itemTypeId: offer.itemTypeId,
        amount,
        unitPrice: offer.unitPrice,
        totalPrice,
      },
    );
  }

  private fail(
    status: Exclude<AcceptOfferResult["status"], "committed">,
  ): Rollback {
    return new TransactionRollback<AcceptOfferResult>({ status });
  }
}
