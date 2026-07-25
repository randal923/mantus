import type { Position } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import { appendBankLedger } from "../economy/appendBankLedger";
import { COIN_STACK_LIMIT } from "../economy/coinStackLimit";
import { countMoneyWorth } from "../economy/countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../economy/CurrencyBalance";
import { debitBankBalance } from "../economy/debitBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { planMoneySpend } from "../economy/planMoneySpend";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { NpcTravelCommitResult } from "./NpcTravelCommitResult";
import type { NpcTravelStore } from "./NpcTravelStore";

export class PgNpcTravelStore implements NpcTravelStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  commit(
    characterId: string,
    expectedCharacterVersion: number,
    destination: Position,
    cost: number,
    npcTypeId: string,
    offerId: string,
  ): Promise<NpcTravelCommitResult> {
    this.validateRequest(
      characterId,
      expectedCharacterVersion,
      destination,
      cost,
      npcTypeId,
      offerId,
    );
    return runSerializableTransaction(this.pool, (client) =>
      this.execute(
        client,
        characterId,
        expectedCharacterVersion,
        destination,
        cost,
        npcTypeId,
        offerId,
      ),
    );
  }

  private async execute(
    client: PoolClient,
    characterId: string,
    expectedCharacterVersion: number,
    destination: Position,
    cost: number,
    npcTypeId: string,
    offerId: string,
  ): Promise<NpcTravelCommitResult> {
    const character = await client.query<{ version: number }>(
      "SELECT version FROM characters WHERE id = $1 FOR UPDATE",
      [characterId],
    );
    if (character.rows[0]?.version !== expectedCharacterVersion) {
      throw new Error("character travel version is stale");
    }
    const coinOps = new PgCoinOperations(client, characterId, this.catalog);
    const owned = await coinOps.loadOwnedItems();
    const coins = coinOps.coinRows(owned);
    const carried = {
      gold: coinOps.countRows(coins.gold),
      platinum: coinOps.countRows(coins.platinum),
      crystal: coinOps.countRows(coins.crystal),
    };
    // Canary's removeMoneyBank: carried coins first, the bank covers the rest.
    const carriedPay = Math.min(countMoneyWorth(carried), cost);
    const bankPay = cost - carriedPay;
    if (bankPay > 0) {
      const balance = await lockBankBalance(client, characterId);
      if (balance < bankPay) {
        // Nothing has been mutated yet, so rolling back leaves no partial
        // debit — the fare is all-or-nothing across both legs.
        throw new TransactionRollback<NpcTravelCommitResult>({
          status: "insufficient-funds",
        });
      }
    }
    const payment = planMoneySpend(carried, carriedPay);
    if (!payment) throw new Error("travel payment plan is inconsistent");

    const after = new Map<string, Item>();
    const removedItemIds: string[] = [];
    for (const spend of [
      { rows: coins.gold, count: payment.goldSpent, typeId: GOLD_COIN_TYPE_ID },
      {
        rows: coins.platinum,
        count: payment.platinumSpent,
        typeId: PLATINUM_COIN_TYPE_ID,
      },
      {
        rows: coins.crystal,
        count: payment.crystalSpent,
        typeId: CRYSTAL_COIN_TYPE_ID,
      },
    ]) {
      await coinOps.destroyItems(
        spend.rows,
        spend.count,
        spend.typeId,
        "npc-travel",
        after,
        removedItemIds,
      );
    }
    // An exact fare needs no change, so it never locks the backpack.
    if (payment.goldChange > 0 || payment.platinumChange > 0) {
      const backpack = await coinOps.lockBackpackSlots();
      if (!backpack) {
        throw new Error("no backpack space is available for travel change");
      }
      for (const grant of [
        {
          rows: coins.gold,
          count: payment.goldChange,
          typeId: GOLD_COIN_TYPE_ID,
        },
        {
          rows: coins.platinum,
          count: payment.platinumChange,
          typeId: PLATINUM_COIN_TYPE_ID,
        },
      ]) {
        const ungranted = await coinOps.grantStackable(
          grant.rows,
          grant.count,
          grant.typeId,
          COIN_STACK_LIMIT,
          "npc-travel-change",
          after,
          removedItemIds,
          backpack,
        );
        if (ungranted > 0) {
          throw new Error("no backpack space is available for travel change");
        }
      }
    }
    if (bankPay > 0) {
      const balanceAfter = await debitBankBalance(client, characterId, bankPay);
      await appendBankLedger(
        client,
        characterId,
        "npc-travel",
        bankPay,
        balanceAfter,
      );
    }

    const updatedCharacter = await client.query<{ version: number }>(
      `UPDATE characters
       SET position_x = $3, position_y = $4, position_z = $5,
           version = version + 1, updated_at = now()
       WHERE id = $1 AND version = $2
       RETURNING version`,
      [
        characterId,
        expectedCharacterVersion,
        destination.x,
        destination.y,
        destination.z,
      ],
    );
    const characterVersion = updatedCharacter.rows[0]?.version;
    if (characterVersion !== expectedCharacterVersion + 1) {
      throw new Error("character travel version is stale");
    }
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, details)
       VALUES (
         'npc-travel', $1,
         jsonb_build_object(
           'npcTypeId', $2::text, 'offerId', $3::text,
           'cost', $4::integer, 'bankSpent', $8::bigint,
           'destination', jsonb_build_object(
             'x', $5::integer, 'y', $6::integer, 'z', $7::integer
           )
         )
       )`,
      [
        characterId,
        npcTypeId,
        offerId,
        cost,
        destination.x,
        destination.y,
        destination.z,
        bankPay,
      ],
    );
    return {
      status: "committed",
      characterVersion,
      mutation: { after: [...after.values()], removedItemIds },
    };
  }

  private validateRequest(
    characterId: string,
    expectedCharacterVersion: number,
    destination: Position,
    cost: number,
    npcTypeId: string,
    offerId: string,
  ): void {
    if (
      characterId.length === 0 ||
      characterId.length > 128 ||
      !Number.isInteger(expectedCharacterVersion) ||
      expectedCharacterVersion < 1 ||
      !Number.isInteger(cost) ||
      cost < 0 ||
      !Number.isInteger(destination.x) ||
      !Number.isInteger(destination.y) ||
      !Number.isInteger(destination.z) ||
      destination.x < 0 ||
      destination.x > 65_535 ||
      destination.y < 0 ||
      destination.y > 65_535 ||
      destination.z < 0 ||
      destination.z > 15 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(npcTypeId) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(offerId)
    ) {
      throw new Error("invalid travel request");
    }
  }
}
