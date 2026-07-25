import type { Pool } from "pg";
import { COIN_STACK_LIMIT } from "../economy/coinStackLimit";
import { countMoneyWorth } from "../economy/countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../economy/CurrencyBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { planMoneySpend } from "../economy/planMoneySpend";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import {
  learnedSpellStorageKey,
  type LearnSpellCommitResult,
  type SpellTeacherStore,
} from "./SpellTeacherStore";

interface LockedCharacter {
  readonly version: number;
  readonly level: number;
}

const SPELL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Postgres SpellTeacherStore, mirroring PgPromotionStore: one SERIALIZABLE
 * transaction re-reads the character under a row lock, re-checks level and
 * whether the spell is already known from database truth (never from what
 * the dialogue offered), pays with carried coins before bank funds, records
 * the grant, and writes both the bank ledger row and the audit row.
 */
export class PgSpellTeacherStore implements SpellTeacherStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  commit(
    characterId: string,
    expectedCharacterVersion: number,
    spellId: string,
    minimumLevel: number,
    price: number,
    npcTypeId: string,
  ): Promise<LearnSpellCommitResult> {
    this.validateRequest(
      characterId,
      expectedCharacterVersion,
      spellId,
      minimumLevel,
      price,
      npcTypeId,
    );
    const storageKey = learnedSpellStorageKey(spellId);
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<LockedCharacter>(
        `SELECT version, level FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId],
      );
      const character = locked.rows[0];
      if (!character || character.version !== expectedCharacterVersion) {
        throw new Error("spell purchase character version is stale");
      }
      if (character.level < minimumLevel) return { status: "level-too-low" };
      // Re-read the grant inside the transaction: two racing purchases of the
      // same spell must charge exactly once.
      const known = await client.query<{ storage_value: number }>(
        `SELECT storage_value FROM character_storages
         WHERE character_id = $1 AND storage_key = $2 FOR UPDATE`,
        [characterId, storageKey],
      );
      if ((known.rows[0]?.storage_value ?? 0) > 0) {
        return { status: "already-known" };
      }

      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const coins = coinOps.coinRows(owned);
      const carried = {
        gold: coinOps.countRows(coins.gold),
        platinum: coinOps.countRows(coins.platinum),
        crystal: coinOps.countRows(coins.crystal),
      };
      const carriedPay = Math.min(countMoneyWorth(carried), price);
      const bankPay = price - carriedPay;
      if (bankPay > 0) {
        const balance = await lockBankBalance(client, characterId);
        if (balance < bankPay) return { status: "insufficient-funds" };
      }
      const plan = planMoneySpend(carried, carriedPay);
      if (!plan) throw new Error("spell payment plan is inconsistent");

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      for (const spend of [
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
      ]) {
        await coinOps.destroyItems(
          spend.rows,
          spend.count,
          spend.typeId,
          "spell-purchase",
          after,
          removedItemIds,
        );
      }
      if (plan.goldChange > 0 || plan.platinumChange > 0) {
        const backpack = await coinOps.lockBackpackSlots();
        if (!backpack) throw new Error("no backpack space for spell change");
        for (const grant of [
          { rows: coins.gold, count: plan.goldChange, typeId: GOLD_COIN_TYPE_ID },
          {
            rows: coins.platinum,
            count: plan.platinumChange,
            typeId: PLATINUM_COIN_TYPE_ID,
          },
        ]) {
          const granted = await coinOps.grantStackable(
            grant.rows,
            grant.count,
            grant.typeId,
            COIN_STACK_LIMIT,
            "spell-purchase-change",
            after,
            removedItemIds,
            backpack,
          );
          if (!granted) throw new Error("no backpack space for spell change");
        }
      }
      if (bankPay > 0) {
        const debit = await client.query<{ balance: string }>(
          `UPDATE bank_accounts
           SET balance = balance - $2, version = version + 1, updated_at = now()
           WHERE character_id = $1 AND balance >= $2
           RETURNING balance`,
          [characterId, bankPay],
        );
        const balanceAfter = debit.rows[0]?.balance;
        if (balanceAfter === undefined) {
          throw new Error("spell purchase bank balance changed while locked");
        }
        await client.query(
          `INSERT INTO bank_ledger (
             character_id, entry_type, amount, balance_after
           ) VALUES ($1, 'spell-purchase', $2, $3)`,
          [characterId, bankPay, balanceAfter],
        );
      }
      await client.query(
        `INSERT INTO character_storages (character_id, storage_key, storage_value)
         VALUES ($1, $2, 1)
         ON CONFLICT (character_id, storage_key)
         DO UPDATE SET storage_value = 1`,
        [characterId, storageKey],
      );
      const updated = await client.query<{ version: number }>(
        `UPDATE characters
         SET version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2
         RETURNING version`,
        [characterId, expectedCharacterVersion],
      );
      const characterVersion = updated.rows[0]?.version;
      if (characterVersion !== expectedCharacterVersion + 1) {
        throw new Error("spell purchase character version is stale");
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'spell-purchase', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'spellId', $3::text,
             'price', $4::integer, 'bankSpent', $5::integer
           )
         )`,
        [characterId, npcTypeId, spellId, price, bankPay],
      );
      return {
        status: "committed",
        characterVersion,
        storageKey,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  private validateRequest(
    characterId: string,
    expectedCharacterVersion: number,
    spellId: string,
    minimumLevel: number,
    price: number,
    npcTypeId: string,
  ): void {
    if (
      characterId.length < 1 ||
      characterId.length > 128 ||
      !Number.isInteger(expectedCharacterVersion) ||
      expectedCharacterVersion < 1 ||
      !SPELL_ID.test(spellId) ||
      !Number.isInteger(minimumLevel) ||
      minimumLevel < 1 ||
      minimumLevel > 10_000 ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !SPELL_ID.test(npcTypeId)
    ) {
      throw new Error("invalid spell purchase request");
    }
  }
}
