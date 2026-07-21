import type { Position } from "@tibia/protocol";
import type { Pool } from "pg";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { NpcTravelCommitResult } from "./NpcTravelCommitResult";
import type { NpcTravelStore } from "./NpcTravelStore";
import { planNpcFarePayment } from "./planNpcFarePayment";

export class PgNpcTravelStore implements NpcTravelStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async commit(
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const character = await client.query<{ version: number }>(
        "SELECT version FROM characters WHERE id = $1 FOR UPDATE",
        [characterId],
      );
      if (character.rows[0]?.version !== expectedCharacterVersion) {
        throw new Error("character travel version is stale");
      }
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const gold = coinOps.rowsOfType(owned, 3031);
      const platinum = coinOps.rowsOfType(owned, 3035);
      const payment = planNpcFarePayment(
        coinOps.countRows(gold),
        coinOps.countRows(platinum),
        cost,
      );
      if (!payment) {
        await client.query("COMMIT");
        return { status: "insufficient-funds" };
      }

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      await coinOps.destroyItems(
        gold,
        payment.goldSpent,
        3031,
        "npc-travel",
        after,
        removedItemIds,
      );
      await coinOps.destroyItems(
        platinum,
        payment.platinumSpent,
        3035,
        "npc-travel",
        after,
        removedItemIds,
      );
      if (payment.goldChange > 0) {
        const backpack = await coinOps.lockBackpackSlots(after);
        if (!backpack) {
          throw new Error("no backpack space is available for travel change");
        }
        const changeGranted = await coinOps.grantStackable(
          gold,
          payment.goldChange,
          3031,
          100,
          "npc-travel-change",
          after,
          removedItemIds,
          backpack,
        );
        if (!changeGranted) {
          throw new Error("no backpack space is available for travel change");
        }
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
             'cost', $4::integer,
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
        ],
      );
      await client.query("COMMIT");
      return {
        status: "committed",
        characterVersion,
        mutation: { after: [...after.values()], removedItemIds },
      };
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
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
