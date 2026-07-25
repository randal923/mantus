import { randomUUID } from "node:crypto";
import {
  DEPOT_LIMITS,
  MAX_PREMIUM_DAYS,
  STORE_LIMITS,
  type StoreHistoryEntry,
  type StoreOffer,
} from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import { DepotTxHelper } from "../depot/DepotTxHelper";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { requireItem } from "../depot/requireItem";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { lockCharacterQuery } from "../depot/sql/lockCharacterQuery";
import { rewardAuditInsert } from "../depot/sql/rewardAuditInsert";
import { rewardDeliveryInsert } from "../depot/sql/rewardDeliveryInsert";
import { rewardItemInsert } from "../depot/sql/rewardItemInsert";
import { rewardStorageStateLockQuery } from "../depot/sql/rewardStorageStateLockQuery";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { Item } from "../item/Item";
import type {
  MantusStoreGrantResult,
  MantusStorePurchaseResult,
  MantusStoreRefundResult,
  MantusStoreStore,
} from "./MantusStoreStore";
import { coinLedgerHistoryQuery } from "./sql/coinLedgerHistoryQuery";
import { coinLedgerInsert } from "./sql/coinLedgerInsert";
import { lockCoinLedgerEntryQuery } from "./sql/lockCoinLedgerEntryQuery";
import { lockStoreAccountQuery } from "./sql/lockStoreAccountQuery";
import { storeAuditInsert } from "./sql/storeAuditInsert";
import { storeRequestKeyQuery } from "./sql/storeRequestKeyQuery";

interface LockedAccount {
  readonly mantus_coins: string;
  readonly premium_until: Date | null;
  readonly transaction_now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PgMantusStore implements MantusStoreStore {
  private readonly depot = new DepotTxHelper();

  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: StoreOffer;
    readonly requestId: string;
  }): Promise<MantusStorePurchaseResult> {
    this.validatePurchase(input);
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
          deliveredItem: null,
        });
      }
      const balance = Number(account.mantus_coins);
      if (!Number.isSafeInteger(balance) || balance < input.offer.price) {
        throw new TransactionRollback<MantusStorePurchaseResult>({
          status: "insufficient-coins",
        });
      }
      const balanceAfter = balance - input.offer.price;
      const premiumUntil = input.offer.premiumDays
        ? this.extendPremium(account, input.offer.premiumDays)
        : account.premium_until;
      // The item leg runs in this same transaction, so a delivery that cannot
      // land rolls the coin debit back with it — never a partial purchase.
      const deliveredItem = input.offer.item
        ? await this.deliverToInbox(
            client,
            input.characterId,
            input.offer.item.itemTypeId,
            input.offer.item.count,
            requestKey,
          )
        : null;
      await this.writeBalance(
        client,
        input.accountId,
        balanceAfter,
        premiumUntil,
      );
      await client.query(coinLedgerInsert, [
        input.accountId,
        "purchase",
        -input.offer.price,
        balanceAfter,
        input.offer.id,
        requestKey,
        null,
        null,
      ]);
      await client.query(storeAuditInsert, [
        "store-purchase",
        input.characterId,
        JSON.stringify({
          accountId: input.accountId,
          offerId: input.offer.id,
          price: input.offer.price,
          balanceAfter,
          premiumUntil: premiumUntil?.toISOString() ?? null,
          deliveredItemId: deliveredItem?.id ?? null,
        }),
      ]);
      return {
        status: "committed" as const,
        balance: balanceAfter,
        premiumUntil,
        deliveredItem,
      };
    });
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

  private async deliverToInbox(
    client: PoolClient,
    characterId: string,
    itemTypeId: number,
    count: number,
    requestKey: string,
  ): Promise<Item> {
    const type = this.catalog.require(itemTypeId);
    if (!type.pickupable || count > type.maxCount) {
      throw new Error("invalid store product item");
    }
    const recipient = await client.query<{ id: string }>(lockCharacterQuery, [
      characterId,
    ]);
    if (!recipient.rows[0]) throw new Error("store recipient not found");
    await this.depot.ensureStorageState(client, characterId);
    await client.query(rewardStorageStateLockQuery, [characterId]);
    const slot = await this.depot.firstFreeSlot(
      client,
      characterId,
      "inbox",
      DEPOT_LIMITS.maxInboxItems,
    );
    if (slot === null) {
      throw new TransactionRollback<MantusStorePurchaseResult>({
        status: "inbox-full",
      });
    }
    const itemId = randomUUID();
    const inserted = await client.query<DepotItemRow>(rewardItemInsert, [
      itemId,
      itemTypeId,
      count,
      "{}",
      characterId,
      slot,
    ]);
    await client.query(rewardDeliveryInsert, [requestKey, characterId, itemId]);
    await client.query(bumpInboxRevisionUpdate, [characterId]);
    await client.query(rewardAuditInsert, [
      characterId,
      itemId,
      requestKey,
      itemTypeId,
      count,
    ]);
    return requireItem(inserted.rows[0]);
  }

  private validatePurchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: StoreOffer;
    readonly requestId: string;
  }): void {
    if (
      input.accountId.length < 1 ||
      input.accountId.length > 128 ||
      input.characterId.length < 1 ||
      input.characterId.length > 128 ||
      input.requestId.length < 1 ||
      input.requestId.length > 64 ||
      !IDENTIFIER.test(input.offer.id) ||
      !Number.isSafeInteger(input.offer.price) ||
      input.offer.price < 1 ||
      input.offer.price > STORE_LIMITS.maxBalance ||
      (input.offer.premiumDays === undefined) ===
        (input.offer.item === undefined) ||
      (input.offer.premiumDays !== undefined &&
        (!Number.isInteger(input.offer.premiumDays) ||
          input.offer.premiumDays < 1 ||
          input.offer.premiumDays > 365)) ||
      (input.offer.item !== undefined &&
        (!Number.isInteger(input.offer.item.itemTypeId) ||
          input.offer.item.itemTypeId < 1 ||
          input.offer.item.itemTypeId > 65_535 ||
          !Number.isInteger(input.offer.item.count) ||
          input.offer.item.count < 1 ||
          input.offer.item.count > 100))
    ) {
      throw new Error("invalid store purchase");
    }
  }
}
