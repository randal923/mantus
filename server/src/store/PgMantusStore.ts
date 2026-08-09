import {
  MAX_PREMIUM_DAYS,
  STORE_LIMITS,
  type StoreHistoryEntry,
} from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import { localDayKey } from "../boosted/localDayKey";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { Item } from "../item/Item";
import { deliverExpBoost } from "./delivery/deliverExpBoost";
import { deliverBoundItem } from "./delivery/deliverBoundItem";
import { deliverMount } from "./delivery/deliverMount";
import { deliverNameChange } from "./delivery/deliverNameChange";
import { deliverOutfit } from "./delivery/deliverOutfit";
import { deliverPreyWildcards } from "./delivery/deliverPreyWildcards";
import { deliverSexChange } from "./delivery/deliverSexChange";
import { deliverSlotUnlock } from "./delivery/deliverSlotUnlock";
import type {
  StoreCharacterRow,
  StoreDeliveryContext,
} from "./delivery/StoreDeliveryContext";
import type {
  MantusStoreGrantResult,
  MantusStorePurchaseResult,
  MantusStoreRefundResult,
  MantusStoreStore,
  StoreDbFacts,
} from "./MantusStoreStore";
import { coinLedgerHistoryQuery } from "./sql/coinLedgerHistoryQuery";
import { coinLedgerInsert } from "./sql/coinLedgerInsert";
import { ensureStoreLimitsInsert } from "./sql/ensureStoreLimitsInsert";
import { lockCoinLedgerEntryQuery } from "./sql/lockCoinLedgerEntryQuery";
import { lockStoreAccountQuery } from "./sql/lockStoreAccountQuery";
import { lockStoreCharacterQuery } from "./sql/lockStoreCharacterQuery";
import { lockStoreLimitsQuery } from "./sql/lockStoreLimitsQuery";
import { storeAuditInsert } from "./sql/storeAuditInsert";
import { storeRequestKeyQuery } from "./sql/storeRequestKeyQuery";
import { updateStoreLimitsQuery } from "./sql/updateStoreLimitsQuery";
import { STORE_OFFERS_BY_ID, type StoreGrant } from "./storeCatalog";
import { XP_BOOST_DAILY_LIMIT } from "./storeOfferAvailability";
import type { StorePurchaseEffect } from "./StorePurchaseEffect";
import { xpBoostPrice } from "./xpBoostPrice";

interface LockedAccount {
  readonly mantus_coins: string;
  readonly premium_until: Date | null;
  readonly transaction_now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Postgres Mantus Store. Every purchase is one SERIALIZABLE transaction that
 * locks the account and the character, re-derives the price from the pinned
 * catalog and the character's own counters, performs the product's delivery
 * leg, writes the coin ledger row and the audit row — and commits all of it
 * or none of it. There is no window in which coins are gone and the product
 * is not delivered, or the reverse (charter rules 2, 4 and 11).
 */
export class PgMantusStore implements MantusStoreStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offerId: string;
    readonly requestId: string;
    readonly newName?: string;
  }): Promise<MantusStorePurchaseResult> {
    if (
      input.accountId.length < 1 ||
      input.accountId.length > 128 ||
      input.characterId.length < 1 ||
      input.characterId.length > 128 ||
      input.requestId.length < 1 ||
      input.requestId.length > 64
    ) {
      throw new Error("invalid store purchase");
    }
    // Resolved here, from the server's own catalog: the message named an id
    // and nothing more.
    const entry = STORE_OFFERS_BY_ID.get(input.offerId);
    if (!entry) return { status: "offer-not-found" };

    const requestKey = `store-purchase:${input.accountId}:${input.requestId}`;
    return runSerializableTransaction(this.pool, async (client) => {
      const account = await this.lockAccount(client, input.accountId);
      // Replay guard first: a retried purchase must not charge again.
      const replayed = await client.query(storeRequestKeyQuery, [requestKey]);
      if (replayed.rows.length > 0) {
        throw new TransactionRollback<MantusStorePurchaseResult>({
          status: "committed",
          balance: Number(account.mantus_coins),
          premiumUntil: account.premium_until,
          price: 0,
          effect: null,
          deliveredItems: [],
        });
      }
      const character = await this.lockCharacter(client, input.characterId);

      // The XP boost's price escalates with the day's purchases, so the
      // charged price comes from the locked counter — never from the offer
      // the client is looking at.
      const price =
        entry.offer.grant.kind === "exp-boost"
          ? xpBoostPrice(
              await this.bumpExpBoostCount(
                client,
                input.characterId,
                account.transaction_now,
              ),
            )
          : entry.offer.price;

      const balance = Number(account.mantus_coins);
      if (!Number.isSafeInteger(balance) || balance < price) {
        throw new TransactionRollback<MantusStorePurchaseResult>({
          status: "insufficient-coins",
        });
      }
      const balanceAfter = balance - price;
      const premiumUntil =
        entry.offer.grant.kind === "premium"
          ? this.extendPremium(account, entry.offer.grant.days)
          : account.premium_until;

      const context: StoreDeliveryContext = {
        client,
        characterId: input.characterId,
        accountId: input.accountId,
        character,
        catalog: this.catalog,
        requestKey,
        transactionNow: account.transaction_now,
        ...(input.newName === undefined ? {} : { newName: input.newName }),
      };
      const delivered = await this.deliver(context, entry.offer.grant);

      await this.writeBalance(
        client,
        input.accountId,
        balanceAfter,
        premiumUntil,
      );
      await client.query(coinLedgerInsert, [
        input.accountId,
        "purchase",
        -price,
        balanceAfter,
        entry.offer.id,
        requestKey,
        null,
        null,
      ]);
      await client.query(storeAuditInsert, [
        "store-purchase",
        input.characterId,
        JSON.stringify({
          accountId: input.accountId,
          offerId: entry.offer.id,
          productId: entry.product.id,
          kind: entry.product.kind,
          price,
          balanceAfter,
          premiumUntil: premiumUntil?.toISOString() ?? null,
          deliveredItemIds: delivered.items.map((item) => item.id),
        }),
      ]);
      return {
        status: "committed" as const,
        balance: balanceAfter,
        premiumUntil,
        price,
        effect: delivered.effect,
        deliveredItems: delivered.items,
      };
    });
  }

  /** Dispatches the product's own delivery leg inside the transaction. */
  private async deliver(
    context: StoreDeliveryContext,
    grant: StoreGrant,
  ): Promise<{
    readonly effect: StorePurchaseEffect;
    readonly items: ReadonlyArray<Item>;
  }> {
    if (grant.kind === "premium") {
      return { effect: { kind: "premium" }, items: [] };
    }
    if (grant.kind === "outfit" || grant.kind === "outfit-addon") {
      return { effect: await deliverOutfit(context, grant), items: [] };
    }
    if (grant.kind === "mount") {
      return { effect: await deliverMount(context, grant), items: [] };
    }
    if (
      grant.kind === "item" ||
      grant.kind === "stackable" ||
      grant.kind === "charges" ||
      grant.kind === "house-item"
    ) {
      const { items } = await deliverBoundItem(context, grant);
      const first = items[0];
      if (!first) throw new Error("store delivery produced no item");
      return { effect: { kind: "inbox-item", item: first }, items };
    }
    if (grant.kind === "prey-wildcard") {
      return { effect: await deliverPreyWildcards(context, grant), items: [] };
    }
    if (grant.kind === "prey-slot" || grant.kind === "hunting-slot") {
      return { effect: await deliverSlotUnlock(context, grant.kind), items: [] };
    }
    if (grant.kind === "exp-boost") {
      return { effect: await deliverExpBoost(context), items: [] };
    }
    if (grant.kind === "sex-change") {
      return { effect: await deliverSexChange(context), items: [] };
    }
    if (grant.kind === "name-change") {
      return { effect: await deliverNameChange(context), items: [] };
    }
    // Temple teleport moves a live creature and writes nothing durable; the
    // tick applies it from the committed outcome.
    return { effect: { kind: "temple-teleport" }, items: [] };
  }

  /**
   * Rolls the per-day XP boost counter forward and returns how many boosts
   * had already been bought today — the index the price curve uses. Refuses
   * once Canary's daily cap is reached.
   */
  private async bumpExpBoostCount(
    client: PoolClient,
    characterId: string,
    transactionNow: Date,
  ): Promise<number> {
    await client.query(ensureStoreLimitsInsert, [characterId]);
    const locked = await client.query<{
      exp_boost_day: string | null;
      exp_boost_count: number;
    }>(lockStoreLimitsQuery, [characterId]);
    const row = locked.rows[0];
    const today = localDayKey(transactionNow.getTime());
    const already = row?.exp_boost_day === today ? row.exp_boost_count : 0;
    if (already >= XP_BOOST_DAILY_LIMIT) {
      throw new TransactionRollback<MantusStorePurchaseResult>({
        status: "limit-reached",
      });
    }
    await client.query(updateStoreLimitsQuery, [
      characterId,
      today,
      already + 1,
    ]);
    return already;
  }

  async facts(
    characterId: string,
    uniqueItemTypeIds: ReadonlyArray<number>,
  ): Promise<StoreDbFacts> {
    const bounded = uniqueItemTypeIds
      .filter((id) => Number.isInteger(id) && id > 0 && id <= 65_535)
      .slice(0, 32);
    // Recursive: bound-container deliveries are container-located rows with
    // no character_id of their own, and must still grey out a unique offer.
    const owned =
      bounded.length === 0
        ? { rows: [] as Array<{ item_type_id: number }> }
        : await this.pool.query<{ item_type_id: number }>(
            `WITH RECURSIVE owned AS (
               SELECT id, item_type_id FROM items WHERE character_id = $1
               UNION ALL
               SELECT child.id, child.item_type_id
               FROM items child JOIN owned parent ON child.container_id = parent.id
             )
             SELECT DISTINCT item_type_id FROM owned
             WHERE item_type_id = ANY($2::int[])`,
            [characterId, bounded],
          );
    const limits = await this.pool.query<{
      exp_boost_day: string | null;
      exp_boost_count: number;
    }>(
      `SELECT to_char(exp_boost_day, 'YYYY-MM-DD') AS exp_boost_day,
              exp_boost_count
       FROM character_store_limits
       WHERE character_id = $1`,
      [characterId],
    );
    const row = limits.rows[0];
    const today = localDayKey(Date.now());
    return {
      ownedUniqueItemTypeIds: owned.rows.map((entry) => entry.item_type_id),
      xpBoostPurchasesToday:
        row?.exp_boost_day === today ? row.exp_boost_count : 0,
    };
  }

  async grant(input: {
    readonly accountId: string;
    readonly amount: number;
    readonly grantKey: string;
    readonly operatorCharacterId: string;
  }): Promise<MantusStoreGrantResult> {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount < 1 ||
      input.amount > STORE_LIMITS.maxBalance ||
      input.grantKey.length < 1 ||
      input.grantKey.length > 128
    ) {
      throw new Error("invalid store grant");
    }
    const requestKey = `store-grant:${input.grantKey}`;
    return runSerializableTransaction(this.pool, async (client) => {
      const account = await this.lockAccount(client, input.accountId);
      const replayed = await client.query(storeRequestKeyQuery, [requestKey]);
      if (replayed.rows.length > 0) {
        throw new TransactionRollback<MantusStoreGrantResult>({
          status: "committed",
          balance: Number(account.mantus_coins),
        });
      }
      const balanceAfter = Number(account.mantus_coins) + input.amount;
      if (balanceAfter > STORE_LIMITS.maxBalance) {
        throw new TransactionRollback<MantusStoreGrantResult>({
          status: "balance-limit",
        });
      }
      await this.writeBalance(
        client,
        input.accountId,
        balanceAfter,
        account.premium_until,
      );
      await client.query(coinLedgerInsert, [
        input.accountId,
        "grant",
        input.amount,
        balanceAfter,
        null,
        requestKey,
        null,
        input.operatorCharacterId,
      ]);
      await client.query(storeAuditInsert, [
        "store-grant",
        input.operatorCharacterId,
        JSON.stringify({
          accountId: input.accountId,
          amount: input.amount,
          balanceAfter,
          grantKey: input.grantKey,
        }),
      ]);
      return { status: "committed" as const, balance: balanceAfter };
    });
  }

  async refund(input: {
    readonly ledgerEntryId: string;
    readonly operatorCharacterId: string;
  }): Promise<MantusStoreRefundResult> {
    if (!/^[0-9]{1,18}$/.test(input.ledgerEntryId)) {
      throw new Error("invalid store refund");
    }
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<{
        id: string;
        account_id: string;
        entry_type: string;
        amount: string;
        offer_id: string | null;
      }>(lockCoinLedgerEntryQuery, [input.ledgerEntryId]);
      const entry = locked.rows[0];
      if (!entry || entry.entry_type !== "purchase") {
        throw new TransactionRollback<MantusStoreRefundResult>({
          status: "entry-not-found",
        });
      }
      const account = await this.lockAccount(client, entry.account_id);
      const refunded = Math.abs(Number(entry.amount));
      const balanceAfter = Number(account.mantus_coins) + refunded;
      if (balanceAfter > STORE_LIMITS.maxBalance) {
        throw new TransactionRollback<MantusStoreRefundResult>({
          status: "balance-limit",
        });
      }
      await this.writeBalance(
        client,
        entry.account_id,
        balanceAfter,
        account.premium_until,
      );
      // The unique index on refunded_entry_id is what makes "once" true; a
      // second refund of the same purchase fails here, not in a read-check.
      const inserted = await client.query(coinLedgerInsert, [
        entry.account_id,
        "refund",
        refunded,
        balanceAfter,
        entry.offer_id,
        `store-refund:${entry.id}`,
        entry.id,
        input.operatorCharacterId,
      ]);
      if (inserted.rowCount !== 1) {
        throw new TransactionRollback<MantusStoreRefundResult>({
          status: "already-refunded",
        });
      }
      await client.query(storeAuditInsert, [
        "store-refund",
        input.operatorCharacterId,
        JSON.stringify({
          accountId: entry.account_id,
          ledgerEntryId: entry.id,
          offerId: entry.offer_id,
          amount: refunded,
          balanceAfter,
        }),
      ]);
      return { status: "committed" as const, balance: balanceAfter };
    });
  }

  async history(
    accountId: string,
    limit: number,
  ): Promise<ReadonlyArray<StoreHistoryEntry>> {
    const bounded = Math.min(
      Math.max(1, Math.trunc(limit)),
      STORE_LIMITS.maxHistoryEntries,
    );
    const rows = await this.pool.query<{
      id: string;
      entry_type: "grant" | "purchase" | "refund";
      amount: string;
      balance_after: string;
      offer_id: string | null;
      occurred_at: Date;
    }>(coinLedgerHistoryQuery, [accountId, bounded]);
    return rows.rows.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      amount: Number(row.amount),
      balanceAfter: Number(row.balance_after),
      offerId: row.offer_id,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }

  private async lockAccount(
    client: PoolClient,
    accountId: string,
  ): Promise<LockedAccount> {
    const locked = await client.query<LockedAccount>(lockStoreAccountQuery, [
      accountId,
    ]);
    const account = locked.rows[0];
    if (!account) {
      throw new TransactionRollback<{ status: "unavailable" }>({
        status: "unavailable",
      });
    }
    return account;
  }

  private async lockCharacter(
    client: PoolClient,
    characterId: string,
  ): Promise<StoreCharacterRow> {
    const locked = await client.query<StoreCharacterRow>(
      lockStoreCharacterQuery,
      [characterId],
    );
    const character = locked.rows[0];
    if (!character) {
      throw new TransactionRollback<{ status: "unavailable" }>({
        status: "unavailable",
      });
    }
    return character;
  }

  private extendPremium(account: LockedAccount, days: number): Date {
    const transactionNow = account.transaction_now.getTime();
    const premiumUntil = account.premium_until?.getTime() ?? 0;
    const next = new Date(
      Math.max(transactionNow, premiumUntil) + days * DAY_MS,
    );
    if (next.getTime() - transactionNow > MAX_PREMIUM_DAYS * DAY_MS) {
      throw new TransactionRollback<MantusStorePurchaseResult>({
        status: "premium-limit",
      });
    }
    return next;
  }

  private async writeBalance(
    client: PoolClient,
    accountId: string,
    balance: number,
    premiumUntil: Date | null,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE accounts
       SET mantus_coins = $2, premium_until = $3
       WHERE id = $1`,
      [accountId, balance, premiumUntil],
    );
    if (updated.rowCount !== 1) throw new Error("store account update failed");
  }
}
