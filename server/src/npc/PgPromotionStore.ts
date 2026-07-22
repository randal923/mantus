import type { CharacterVocation } from "@tibia/protocol";
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
import { getVocation } from "../progression/getVocation";
import type { PromotionCommitResult, PromotionStore } from "./PromotionStore";

interface LockedCharacter {
  readonly version: number;
  readonly level: number;
  readonly vocation: CharacterVocation;
}

export class PgPromotionStore implements PromotionStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  commit(
    characterId: string,
    expectedCharacterVersion: number,
    minimumLevel: number,
    cost: number,
    npcTypeId: string,
  ): Promise<PromotionCommitResult> {
    this.validateRequest(
      characterId,
      expectedCharacterVersion,
      minimumLevel,
      cost,
      npcTypeId,
    );
    return runSerializableTransaction(this.pool, async (client) => {
      const locked = await client.query<LockedCharacter>(
        `SELECT version, level, vocation
         FROM characters WHERE id = $1 FOR UPDATE`,
        [characterId],
      );
      const character = locked.rows[0];
      if (!character || character.version !== expectedCharacterVersion) {
        throw new Error("character promotion version is stale");
      }
      const vocation = getVocation(character.vocation);
      if (!vocation.promotedVocation) return { status: "already-promoted" };
      if (character.level < minimumLevel) return { status: "level-too-low" };

      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const coins = coinOps.coinRows(owned);
      const carried = {
        gold: coinOps.countRows(coins.gold),
        platinum: coinOps.countRows(coins.platinum),
        crystal: coinOps.countRows(coins.crystal),
      };
      const carriedPay = Math.min(countMoneyWorth(carried), cost);
      const bankPay = cost - carriedPay;
      if (bankPay > 0) {
        const balance = await lockBankBalance(client, characterId);
        if (balance < bankPay) return { status: "insufficient-funds" };
      }
      const plan = planMoneySpend(carried, carriedPay);
      if (!plan) throw new Error("promotion payment plan is inconsistent");

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
          "vocation-promotion",
          after,
          removedItemIds,
        );
      }
      if (plan.goldChange > 0 || plan.platinumChange > 0) {
        const backpack = await coinOps.lockBackpackSlots();
        if (!backpack) throw new Error("no backpack space for promotion change");
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
            "vocation-promotion-change",
            after,
            removedItemIds,
            backpack,
          );
          if (!granted) throw new Error("no backpack space for promotion change");
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
          throw new Error("promotion bank balance changed while locked");
        }
        await client.query(
          `INSERT INTO bank_ledger (
             character_id, entry_type, amount, balance_after
           ) VALUES ($1, 'vocation-promotion', $2, $3)`,
          [characterId, bankPay, balanceAfter],
        );
      }
      const promotedVocation = vocation.promotedVocation;
      const updated = await client.query<{ version: number }>(
        `UPDATE characters
         SET vocation = $3,
             minor_charm_echoes = minor_charm_echoes + 100,
             max_minor_charm_echoes = max_minor_charm_echoes + 100,
             version = version + 1,
             updated_at = now()
         WHERE id = $1 AND version = $2 AND vocation = $4
         RETURNING version`,
        [
          characterId,
          expectedCharacterVersion,
          promotedVocation,
          character.vocation,
        ],
      );
      const characterVersion = updated.rows[0]?.version;
      if (characterVersion !== expectedCharacterVersion + 1) {
        throw new Error("character promotion version is stale");
      }
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, details)
         VALUES (
           'vocation-promotion', $1,
           jsonb_build_object(
             'npcTypeId', $2::text, 'fromVocation', $3::text,
             'toVocation', $4::text, 'cost', $5::integer,
             'bankSpent', $6::integer, 'minorCharmEchoesGranted', 100
           )
         )`,
        [
          characterId,
          npcTypeId,
          character.vocation,
          promotedVocation,
          cost,
          bankPay,
        ],
      );
      return {
        status: "committed",
        characterVersion,
        vocation: promotedVocation,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  private validateRequest(
    characterId: string,
    expectedCharacterVersion: number,
    minimumLevel: number,
    cost: number,
    npcTypeId: string,
  ): void {
    if (
      characterId.length < 1 ||
      characterId.length > 128 ||
      !Number.isInteger(expectedCharacterVersion) ||
      expectedCharacterVersion < 1 ||
      !Number.isInteger(minimumLevel) ||
      minimumLevel < 1 ||
      minimumLevel > 10_000 ||
      !Number.isSafeInteger(cost) ||
      cost < 0 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(npcTypeId)
    ) {
      throw new Error("invalid promotion request");
    }
  }
}
