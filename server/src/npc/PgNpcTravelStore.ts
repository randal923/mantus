import { randomUUID } from "node:crypto";
import type { EquipmentSlot, Position } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemLocation } from "../item/ItemLocation";
import type { NpcTravelCommitResult } from "./NpcTravelCommitResult";
import type { NpcTravelStore } from "./NpcTravelStore";
import { planNpcFarePayment } from "./planNpcFarePayment";

interface TravelItemRow {
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

export class PgNpcTravelStore implements NpcTravelStore {
  constructor(private readonly pool: Pool) {}

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
      const owned = await client.query<TravelItemRow>(OWNED_ITEMS_QUERY, [
        characterId,
      ]);
      if (owned.rows.length > 500) {
        throw new Error("character has excessive items");
      }
      const gold = owned.rows
        .filter((row) => row.item_type_id === 3031)
        .sort((left, right) => left.id.localeCompare(right.id));
      const platinum = owned.rows
        .filter((row) => row.item_type_id === 3035)
        .sort((left, right) => left.id.localeCompare(right.id));
      const payment = planNpcFarePayment(
        gold.reduce((total, row) => total + row.count, 0),
        platinum.reduce((total, row) => total + row.count, 0),
        cost,
      );
      if (!payment) {
        await client.query("COMMIT");
        return { status: "insufficient-funds" };
      }

      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      await this.spendCurrency(
        client,
        characterId,
        gold,
        payment.goldSpent,
        3031,
        after,
        removedItemIds,
      );
      await this.spendCurrency(
        client,
        characterId,
        platinum,
        payment.platinumSpent,
        3035,
        after,
        removedItemIds,
      );
      await this.addGoldChange(
        client,
        characterId,
        gold,
        payment.goldChange,
        after,
        removedItemIds,
      );

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

  private async spendCurrency(
    client: PoolClient,
    characterId: string,
    rows: ReadonlyArray<TravelItemRow>,
    count: number,
    itemTypeId: 3031 | 3035,
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
          throw new Error("travel currency version is stale");
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
          throw new Error("travel currency version is stale");
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
             'itemTypeId', $3::integer, 'count', $4::integer,
             'reason', 'npc-travel'
           )
         )`,
        [characterId, row.id, itemTypeId, spent],
      );
    }
    if (remaining !== 0) throw new Error("travel currency balance is stale");
  }

  private async addGoldChange(
    client: PoolClient,
    characterId: string,
    goldRows: ReadonlyArray<TravelItemRow>,
    count: number,
    after: Map<string, Item>,
    removedItemIds: ReadonlyArray<string>,
  ): Promise<void> {
    let remaining = count;
    for (const row of goldRows) {
      if (remaining === 0) return;
      if (removedItemIds.includes(row.id)) continue;
      const current = after.get(row.id) ?? this.itemFromRow(row);
      const added = Math.min(100 - current.count, remaining);
      if (added === 0) continue;
      const updated = await client.query<{ version: number }>(
        `UPDATE items
         SET count = count + $2, version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $3
         RETURNING version`,
        [row.id, added, current.version],
      );
      if (updated.rows[0]?.version !== current.version + 1) {
        throw new Error("travel currency version is stale");
      }
      after.set(row.id, {
        ...current,
        count: current.count + added,
        version: current.version + 1,
      });
      await this.auditGoldChange(
        client,
        characterId,
        row.id,
        added,
      );
      remaining -= added;
    }
    if (remaining === 0) return;

    const itemId = randomUUID();
    const slot = await this.firstInventorySlot(client, characterId);
    await client.query(
      `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, slot_index
       ) VALUES ($1, 3031, $2, 'inventory', $3, $4)`,
      [itemId, remaining, characterId, slot],
    );
    after.set(itemId, {
      id: itemId,
      typeId: 3031,
      count: remaining,
      attributes: {},
      version: 1,
      location: { kind: "inventory", characterId, slot },
    });
    await this.auditGoldChange(
      client,
      characterId,
      itemId,
      remaining,
    );
  }

  private async firstInventorySlot(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    const occupied = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       FOR UPDATE`,
      [characterId],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    for (let slot = 0; slot < 100; slot++) {
      if (!slots.has(slot)) return slot;
    }
    throw new Error("no inventory slot is available for travel change");
  }

  private async auditGoldChange(
    client: PoolClient,
    characterId: string,
    itemId: string,
    count: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'itemTypeId', 3031, 'count', $3::integer,
           'reason', 'npc-travel-change'
         )
       )`,
      [characterId, itemId, count],
    );
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

  private itemFromRow(row: TravelItemRow): Item {
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

  private locationFromRow(row: TravelItemRow): ItemLocation {
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
      (row.location_type === "container" ||
        row.location_type === "corpse") &&
      row.container_id &&
      row.slot_index !== null
    ) {
      return {
        kind: row.location_type,
        containerId: row.container_id,
        slot: row.slot_index,
      };
    }
    throw new Error(`item ${row.id} has an invalid travel location`);
  }
}
