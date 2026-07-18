import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type {
  BankDepositResult,
  BankTransferResult,
  BankWithdrawResult,
} from "./BankOperationResult";
import type { BankStore } from "./BankStore";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { PgCoinOperations } from "./PgCoinOperations";
import { planMoneyGrant } from "./planMoneyGrant";
import { planMoneySpend } from "./planMoneySpend";
import { TransactionRollback } from "./TransactionRollback";

const COIN_STACK_LIMIT = 100;

export class PgBankStore implements BankStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async balance(characterId: string): Promise<number> {
    this.validateCharacterId(characterId);
    const result = await this.pool.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1",
      [characterId],
    );
    const row = result.rows[0];
    return row ? this.parseBalance(row.balance) : 0;
  }

  async deposit(
    characterId: string,
    amount: number,
  ): Promise<BankDepositResult> {
    this.validateCharacterId(characterId);
    this.validateAmount(amount);
    return this.transaction(async (client) => {
      const balance = await this.lockBalance(client, characterId);
      if (balance + amount > BANK_LIMITS.maxBalance) {
        return { status: "balance-limit" };
      }
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const coins = coinOps.coinRows(owned);
      const plan = planMoneySpend(
        {
          gold: coinOps.countRows(coins.gold),
          platinum: coinOps.countRows(coins.platinum),
          crystal: coinOps.countRows(coins.crystal),
        },
        amount,
      );
      if (!plan) return { status: "insufficient-funds" };

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      const spends = [
        { rows: coins.gold, count: plan.goldSpent, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: plan.platinumSpent,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
        {
          rows: coins.crystal,
          count: plan.crystalSpent,
          typeId: CRYSTAL_COIN_TYPE_ID,
        },
      ];
      for (const spend of spends) {
        await coinOps.destroyItems(
          spend.rows,
          spend.count,
          spend.typeId,
          "bank-deposit",
          after,
          removedItemIds,
        );
      }
      const backpack = await coinOps.lockBackpackSlots(after);
      if (!backpack) {
        throw new TransactionRollback<BankDepositResult>({
          status: "no-space",
        });
      }
      const grants = [
        { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: plan.platinumChange,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
      ];
      for (const grant of grants) {
        const granted = await coinOps.grantStackable(
          grant.rows,
          grant.count,
          grant.typeId,
          COIN_STACK_LIMIT,
          "bank-deposit-change",
          after,
          removedItemIds,
          backpack,
        );
        if (!granted) {
          throw new TransactionRollback<BankDepositResult>({
            status: "no-space",
          });
        }
      }
      const balanceAfter = await this.creditBalance(client, characterId, amount);
      await this.appendLedger(
        client,
        characterId,
        "deposit",
        amount,
        balanceAfter,
      );
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bank-deposit', $1,
           jsonb_build_object('amount', $2::bigint, 'balanceAfter', $3::bigint)
         )`,
        [characterId, amount, balanceAfter],
      );
      return {
        status: "committed",
        balance: balanceAfter,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  async withdraw(
    characterId: string,
    amount: number,
  ): Promise<BankWithdrawResult> {
    this.validateCharacterId(characterId);
    this.validateAmount(amount);
    return this.transaction(async (client) => {
      const balance = await this.lockBalance(client, characterId);
      if (balance < amount) return { status: "insufficient-balance" };
      const grant = planMoneyGrant(amount);
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const coins = coinOps.coinRows(owned);

      const after = new Map<string, Item>();
      const backpack = await coinOps.lockBackpackSlots(after);
      if (!backpack) {
        throw new TransactionRollback<BankWithdrawResult>({
          status: "no-space",
        });
      }
      const grants = [
        {
          rows: coins.crystal,
          count: grant.crystal,
          typeId: CRYSTAL_COIN_TYPE_ID,
        },
        {
          rows: coins.platinum,
          count: grant.platinum,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
        { rows: coins.gold, count: grant.gold, typeId: GOLD_COIN_TYPE_ID },
      ];
      for (const entry of grants) {
        const granted = await coinOps.grantStackable(
          entry.rows,
          entry.count,
          entry.typeId,
          COIN_STACK_LIMIT,
          "bank-withdraw",
          after,
          [],
          backpack,
        );
        if (!granted) {
          // a partial grant may already be written; roll everything back
          throw new TransactionRollback<BankWithdrawResult>({
            status: "no-space",
          });
        }
      }
      const balanceAfter = await this.debitBalance(client, characterId, amount);
      await this.appendLedger(
        client,
        characterId,
        "withdraw",
        amount,
        balanceAfter,
      );
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bank-withdraw', $1,
           jsonb_build_object('amount', $2::bigint, 'balanceAfter', $3::bigint)
         )`,
        [characterId, amount, balanceAfter],
      );
      return {
        status: "committed",
        balance: balanceAfter,
        mutation: { after: [...after.values()], removedItemIds: [] },
      };
    });
  }

  async transfer(
    characterId: string,
    toCharacterName: string,
    amount: number,
  ): Promise<BankTransferResult> {
    this.validateCharacterId(characterId);
    this.validateAmount(amount);
    if (toCharacterName.length < 3 || toCharacterName.length > 20) {
      return { status: "recipient-not-found" };
    }
    return this.transaction(async (client) => {
      const recipient = await client.query<{ id: string }>(
        "SELECT id FROM characters WHERE normalized_name = lower($1)",
        [toCharacterName],
      );
      const toCharacterId = recipient.rows[0]?.id;
      if (!toCharacterId) return { status: "recipient-not-found" };
      if (toCharacterId === characterId) return { status: "invalid-recipient" };

      await client.query(
        `INSERT INTO bank_accounts (character_id)
         VALUES ($1), ($2)
         ON CONFLICT (character_id) DO NOTHING`,
        [characterId, toCharacterId],
      );
      const locked = await client.query<{
        character_id: string;
        balance: string;
      }>(
        `SELECT character_id, balance FROM bank_accounts
         WHERE character_id IN ($1, $2)
         ORDER BY character_id
         FOR UPDATE`,
        [characterId, toCharacterId],
      );
      const balances = new Map(
        locked.rows.map((row) => [
          row.character_id,
          this.parseBalance(row.balance),
        ]),
      );
      const senderBalance = balances.get(characterId);
      const recipientBalance = balances.get(toCharacterId);
      if (senderBalance === undefined || recipientBalance === undefined) {
        throw new Error("bank transfer accounts are missing");
      }
      if (senderBalance < amount) return { status: "insufficient-balance" };
      if (recipientBalance + amount > BANK_LIMITS.maxBalance) {
        return { status: "balance-limit" };
      }
      const balanceAfter = await this.debitBalance(client, characterId, amount);
      const recipientAfter = await this.creditBalance(
        client,
        toCharacterId,
        amount,
      );
      await this.appendLedger(
        client,
        characterId,
        "transfer-out",
        amount,
        balanceAfter,
        toCharacterId,
      );
      await this.appendLedger(
        client,
        toCharacterId,
        "transfer-in",
        amount,
        recipientAfter,
        characterId,
      );
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bank-transfer', $1,
           jsonb_build_object(
             'amount', $2::bigint,
             'toCharacterId', $3::uuid,
             'balanceAfter', $4::bigint
           )
         )`,
        [characterId, amount, toCharacterId, balanceAfter],
      );
      return { status: "committed", balance: balanceAfter, toCharacterId };
    });
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof TransactionRollback) return cause.result as T;
      throw cause;
    } finally {
      client.release();
    }
  }

  private async lockBalance(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    await client.query(
      `INSERT INTO bank_accounts (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`,
      [characterId],
    );
    const result = await client.query<{ balance: string }>(
      "SELECT balance FROM bank_accounts WHERE character_id = $1 FOR UPDATE",
      [characterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("bank account is missing");
    return this.parseBalance(row.balance);
  }

  private async creditBalance(
    client: PoolClient,
    characterId: string,
    amount: number,
  ): Promise<number> {
    const result = await client.query<{ balance: string }>(
      `UPDATE bank_accounts
       SET balance = balance + $2, version = version + 1, updated_at = now()
       WHERE character_id = $1 AND balance + $2 <= $3
       RETURNING balance`,
      [characterId, amount, BANK_LIMITS.maxBalance],
    );
    const row = result.rows[0];
    if (!row) throw new Error("bank credit failed");
    return this.parseBalance(row.balance);
  }

  private async debitBalance(
    client: PoolClient,
    characterId: string,
    amount: number,
  ): Promise<number> {
    const result = await client.query<{ balance: string }>(
      `UPDATE bank_accounts
       SET balance = balance - $2, version = version + 1, updated_at = now()
       WHERE character_id = $1 AND balance >= $2
       RETURNING balance`,
      [characterId, amount],
    );
    const row = result.rows[0];
    if (!row) throw new Error("bank debit failed");
    return this.parseBalance(row.balance);
  }

  private async appendLedger(
    client: PoolClient,
    characterId: string,
    entryType: "deposit" | "withdraw" | "transfer-in" | "transfer-out",
    amount: number,
    balanceAfter: number,
    counterpartyCharacterId?: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO bank_ledger (
         character_id, entry_type, amount, balance_after,
         counterparty_character_id
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        characterId,
        entryType,
        amount,
        balanceAfter,
        counterpartyCharacterId ?? null,
      ],
    );
  }

  private parseBalance(value: string | number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error("bank balance is out of range");
    }
    return parsed;
  }

  private validateCharacterId(characterId: string): void {
    if (characterId.length === 0 || characterId.length > 128) {
      throw new Error("invalid bank character id");
    }
  }

  private validateAmount(amount: number): void {
    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > BANK_LIMITS.maxTransactionAmount
    ) {
      throw new Error("invalid bank amount");
    }
  }
}
