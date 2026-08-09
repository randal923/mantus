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
import { isBlessingId } from "../progression/blessings";
import { planBlessingPurchase } from "../progression/planBlessingPurchase";
import type { BlessCommitResult, BlessStore } from "./BlessStore";

interface LockedCharacter {
  readonly version: number;
  readonly level: number;
  readonly blessings: number;
}

const NPC_TYPE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Postgres BlessStore, mirroring PgSpellTeacherStore: one SERIALIZABLE
 * transaction re-reads level and blessing mask under a row lock, prices the
 * missing blessings from that database truth (never from what the dialogue
 * quoted), pays with carried coins before bank funds, ORs the grant into the
 * mask, and writes both the bank ledger row and the audit row. Two racing
 * purchases of the same blessing charge exactly once: the second re-read
 * finds the mask already set and returns `already-blessed`.
 */
export class PgBlessStore implements BlessStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  commit(
    characterId: string,
    expectedCharacterVersion: number,
    blessingIds: ReadonlyArray<number>,
    surchargePercent: number,
    npcTypeId: string,
  ): Promise<BlessCommitResult> {
    this.validateRequest(
      characterId,
      expectedCharacterVersion,
      blessingIds,
      surchargePercent,
      npcTypeId,
    );
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<LockedCharacter>(
        `SELECT version, level, blessings FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId],
      );
      const character = locked.rows[0];
      if (!character || character.version !== expectedCharacterVersion) {
        throw new Error("bless purchase character version is stale");
      }
      const plan = planBlessingPurchase(
        blessingIds,
        character.blessings,
        character.level,
        surchargePercent,
      );
      if (plan.missingIds.length === 0) return { status: "already-blessed" };

      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const coins = coinOps.coinRows(owned);
      const carried = {
        gold: coinOps.countRows(coins.gold),
        platinum: coinOps.countRows(coins.platinum),
        crystal: coinOps.countRows(coins.crystal),
      };
      const carriedPay = Math.min(countMoneyWorth(carried), plan.price);
      const bankPay = plan.price - carriedPay;
      if (bankPay > 0) {
        const balance = await lockBankBalance(client, characterId);
        if (balance < bankPay) return { status: "insufficient-funds" };
      }
      const spendPlan = planMoneySpend(carried, carriedPay);
      if (!spendPlan) throw new Error("bless payment plan is inconsistent");

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      for (const spend of [
        { rows: coins.gold, count: spendPlan.goldSpent, typeId: GOLD_COIN_TYPE_ID },
        {
          rows: coins.platinum,
          count: spendPlan.platinumSpent,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
        {
          rows: coins.crystal,
          count: spendPlan.crystalSpent,
          typeId: CRYSTAL_COIN_TYPE_ID,
        },
      ]) {
        await coinOps.destroyItems(
          spend.rows,
          spend.count,
          spend.typeId,
          "bless-purchase",
          after,
          removedItemIds,
        );
      }
      if (spendPlan.goldChange > 0 || spendPlan.platinumChange > 0) {
        const backpack = await coinOps.lockBackpackSlots();
        if (!backpack) throw new Error("no backpack space for bless change");
        for (const grant of [
          {
            rows: coins.gold,
            count: spendPlan.goldChange,
            typeId: GOLD_COIN_TYPE_ID,
          },
          {
            rows: coins.platinum,
            count: spendPlan.platinumChange,
            typeId: PLATINUM_COIN_TYPE_ID,
          },
        ]) {
          const ungranted = await coinOps.grantStackable(
            grant.rows,
            grant.count,
            grant.typeId,
            COIN_STACK_LIMIT,
            "bless-purchase-change",
            after,
            removedItemIds,
            backpack,
          );
          if (ungranted > 0) {
            throw new Error("no backpack space for bless change");
          }
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
          throw new Error("bless purchase bank balance changed while locked");
        }
        await client.query(
          `INSERT INTO bank_ledger (
             character_id, entry_type, amount, balance_after
           ) VALUES ($1, 'bless-purchase', $2, $3)`,
          [characterId, bankPay, balanceAfter],
        );
      }
      const updated = await client.query<{ version: number }>(
        `UPDATE characters
         SET blessings = blessings | $3, version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2
         RETURNING version`,
        [characterId, expectedCharacterVersion, plan.grantMask],
      );
      const characterVersion = updated.rows[0]?.version;
      if (characterVersion !== expectedCharacterVersion + 1) {
        throw new Error("bless purchase character version is stale");
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'bless-purchase', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'blessingIds', $3::jsonb,
             'price', $4::integer, 'bankSpent', $5::integer
           )
         )`,
        [
          characterId,
          npcTypeId,
          JSON.stringify(plan.missingIds),
          plan.price,
          bankPay,
        ],
      );
      return {
        status: "committed",
        characterVersion,
        grantedMask: plan.grantMask,
        price: plan.price,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  private validateRequest(
    characterId: string,
    expectedCharacterVersion: number,
    blessingIds: ReadonlyArray<number>,
    surchargePercent: number,
    npcTypeId: string,
  ): void {
    if (
      characterId.length < 1 ||
      characterId.length > 128 ||
      !Number.isInteger(expectedCharacterVersion) ||
      expectedCharacterVersion < 1 ||
      blessingIds.length < 1 ||
      blessingIds.length > 8 ||
      blessingIds.some((id) => !isBlessingId(id)) ||
      new Set(blessingIds).size !== blessingIds.length ||
      !Number.isInteger(surchargePercent) ||
      surchargePercent < 0 ||
      surchargePercent > 100 ||
      !NPC_TYPE_ID.test(npcTypeId)
    ) {
      throw new Error("invalid bless purchase request");
    }
  }
}
