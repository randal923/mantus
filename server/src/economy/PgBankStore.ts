import { randomUUID } from "node:crypto";
import type { EquipmentSlot } from "@tibia/protocol";
import { BANK_LIMITS } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemLocation } from "../item/ItemLocation";
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
import { planMoneyGrant } from "./planMoneyGrant";
import { planMoneySpend } from "./planMoneySpend";

interface BankItemRow {
  id: string;
  item_type_id: number;
  count: number;
  attributes: unknown;
  version: number;
  location_type: ItemLocation["kind"];
  character_id: string | null;
  container_id: string | null;
  slot_index: number | null;
  equipment_slot: EquipmentSlot | null;
  seed_key: string | null;
}

const OWNED_ITEMS_QUERY = `
  WITH RECURSIVE owned AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.character_id = $1
      AND i.location_type IN ('equipment', 'inventory')
    UNION ALL
    SELECT child.*, owned.item_depth + 1
    FROM items child
    JOIN owned ON child.container_id = owned.id
    WHERE child.location_type IN ('container', 'corpse')
      AND owned.item_depth < 8
  )
  SELECT id, item_type_id, count, attributes, version, location_type,
         character_id, container_id, slot_index, equipment_slot, seed_key
  FROM owned
  ORDER BY item_depth, location_type, equipment_slot, slot_index
  LIMIT 501`;

const COIN_STACK_LIMIT = 100;

export class PgBankStore implements BankStore {
  constructor(private readonly pool: Pool) {}

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
      const owned = await this.loadOwnedItems(client, characterId);
      const coins = this.coinRows(owned);
      const plan = planMoneySpend(
        {
          gold: this.countCoins(coins.gold),
          platinum: this.countCoins(coins.platinum),
          crystal: this.countCoins(coins.crystal),
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
        await this.spendCoins(
          client,
          characterId,
          spend.rows,
          spend.count,
          spend.typeId,
          "bank-deposit",
          after,
          removedItemIds,
        );
      }
      const grants = [
        { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: plan.platinumChange,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
      ];
      const occupiedSlots = await this.lockInventorySlots(client, characterId);
      for (const grant of grants) {
        const granted = await this.grantCoins(
          client,
          characterId,
          grant.rows,
          grant.count,
          grant.typeId,
          "bank-deposit-change",
          after,
          removedItemIds,
          occupiedSlots,
        );
        if (!granted) throw new Error("no slot is available for bank change");
      }
      const balanceAfter = await this.creditBalance(
        client,
        characterId,
        amount,
      );
      await this.appendLedger(client, characterId, "deposit", amount, balanceAfter);
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
      const owned = await this.loadOwnedItems(client, characterId);
      const coins = this.coinRows(owned);
      const occupiedSlots = await this.lockInventorySlots(client, characterId);

      const after = new Map<string, Item>();
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
        const granted = await this.grantCoins(
          client,
          characterId,
          entry.rows,
          entry.count,
          entry.typeId,
          "bank-withdraw",
          after,
          [],
          occupiedSlots,
        );
        if (!granted) return { status: "no-space" };
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

  private async loadOwnedItems(
    client: PoolClient,
    characterId: string,
  ): Promise<BankItemRow[]> {
    const owned = await client.query<BankItemRow>(OWNED_ITEMS_QUERY, [
      characterId,
    ]);
    if (owned.rows.length > 500) {
      throw new Error("character has excessive items");
    }
    return owned.rows;
  }

  private coinRows(rows: ReadonlyArray<BankItemRow>): {
    gold: BankItemRow[];
    platinum: BankItemRow[];
    crystal: BankItemRow[];
  } {
    const ofType = (typeId: number) =>
      rows
        .filter((row) => row.item_type_id === typeId)
        .sort((left, right) => left.id.localeCompare(right.id));
    return {
      gold: ofType(GOLD_COIN_TYPE_ID),
      platinum: ofType(PLATINUM_COIN_TYPE_ID),
      crystal: ofType(CRYSTAL_COIN_TYPE_ID),
    };
  }

  private countCoins(rows: ReadonlyArray<BankItemRow>): number {
    return rows.reduce((total, row) => total + row.count, 0);
  }

  private async spendCoins(
    client: PoolClient,
    characterId: string,
    rows: ReadonlyArray<BankItemRow>,
    count: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: string[],
  ): Promise<void> {
    let remaining = count;
    for (const row of rows) {
      if (remaining === 0) break;
      const spent = Math.min(row.count, remaining);
      remaining -= spent;
      if (spent === row.count) {
        const deleted = await client.query<{ id: string }>(
          "DELETE FROM items WHERE id = $1 AND version = $2 RETURNING id",
          [row.id, row.version],
        );
        if (deleted.rows[0]?.id !== row.id) {
          throw new Error("bank currency version is stale");
        }
        removedItemIds.push(row.id);
      } else {
        const updated = await client.query<{ version: number }>(
          `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING version`,
          [row.id, spent, row.version],
        );
        if (updated.rows[0]?.version !== row.version + 1) {
          throw new Error("bank currency version is stale");
        }
        after.set(row.id, {
          ...this.itemFromRow(row),
          count: row.count - spent,
          version: row.version + 1,
        });
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-destroyed', $1, $2,
           jsonb_build_object(
             'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
           )
         )`,
        [characterId, row.id, itemTypeId, spent, reason],
      );
    }
    if (remaining !== 0) throw new Error("bank currency balance is stale");
  }

  /**
   * Tops up existing stacks of the denomination, then creates new stacks in
   * free inventory slots. Returns false when the slots run out; the caller
   * must roll the transaction back (nothing may be half-granted).
   */
  private async grantCoins(
    client: PoolClient,
    characterId: string,
    rows: ReadonlyArray<BankItemRow>,
    count: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: ReadonlyArray<string>,
    occupiedSlots: Set<number>,
  ): Promise<boolean> {
    let remaining = count;
    for (const row of rows) {
      if (remaining === 0) return true;
      if (removedItemIds.includes(row.id)) continue;
      const current = after.get(row.id) ?? this.itemFromRow(row);
      const added = Math.min(COIN_STACK_LIMIT - current.count, remaining);
      if (added === 0) continue;
      const updated = await client.query<{ version: number }>(
        `UPDATE items
         SET count = count + $2, version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $3
         RETURNING version`,
        [row.id, added, current.version],
      );
      if (updated.rows[0]?.version !== current.version + 1) {
        throw new Error("bank currency version is stale");
      }
      after.set(row.id, {
        ...current,
        count: current.count + added,
        version: current.version + 1,
      });
      await this.auditCoinCreation(
        client,
        characterId,
        row.id,
        itemTypeId,
        added,
        reason,
      );
      remaining -= added;
    }
    while (remaining > 0) {
      const slot = this.takeFreeSlot(occupiedSlots);
      if (slot === null) return false;
      const stack = Math.min(COIN_STACK_LIMIT, remaining);
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO items (
           id, item_type_id, count, location_type, character_id, slot_index
         ) VALUES ($1, $2, $3, 'inventory', $4, $5)`,
        [itemId, itemTypeId, stack, characterId, slot],
      );
      after.set(itemId, {
        id: itemId,
        typeId: itemTypeId,
        count: stack,
        attributes: {},
        version: 1,
        location: { kind: "inventory", characterId, slot },
      });
      await this.auditCoinCreation(
        client,
        characterId,
        itemId,
        itemTypeId,
        stack,
        reason,
      );
      remaining -= stack;
    }
    return true;
  }

  private async lockInventorySlots(
    client: PoolClient,
    characterId: string,
  ): Promise<Set<number>> {
    const occupied = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       FOR UPDATE`,
      [characterId],
    );
    return new Set(occupied.rows.map((row) => row.slot_index));
  }

  private takeFreeSlot(occupiedSlots: Set<number>): number | null {
    for (let slot = 0; slot < 100; slot++) {
      if (!occupiedSlots.has(slot)) {
        occupiedSlots.add(slot);
        return slot;
      }
    }
    return null;
  }

  private async auditCoinCreation(
    client: PoolClient,
    characterId: string,
    itemId: string,
    itemTypeId: number,
    count: number,
    reason: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
         )
       )`,
      [characterId, itemId, itemTypeId, count, reason],
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

  private itemFromRow(row: BankItemRow): Item {
    if (
      !row.attributes ||
      typeof row.attributes !== "object" ||
      Array.isArray(row.attributes)
    ) {
      throw new Error(`item ${row.id} has invalid attributes`);
    }
    return {
      id: row.id,
      typeId: row.item_type_id,
      count: row.count,
      attributes: row.attributes as Record<string, unknown>,
      version: row.version,
      location: this.locationFromRow(row),
      ...(row.seed_key ? { seedKey: row.seed_key } : {}),
    };
  }

  private locationFromRow(row: BankItemRow): ItemLocation {
    if (
      row.location_type === "equipment" &&
      row.character_id &&
      row.equipment_slot
    ) {
      return {
        kind: "equipment",
        characterId: row.character_id,
        slot: row.equipment_slot,
      };
    }
    if (
      row.location_type === "inventory" &&
      row.character_id &&
      row.slot_index !== null
    ) {
      return {
        kind: "inventory",
        characterId: row.character_id,
        slot: row.slot_index,
      };
    }
    if (
      (row.location_type === "container" || row.location_type === "corpse") &&
      row.container_id &&
      row.slot_index !== null
    ) {
      return {
        kind: row.location_type,
        containerId: row.container_id,
        slot: row.slot_index,
      };
    }
    throw new Error(`item ${row.id} has an invalid bank location`);
  }
}
