import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemLocation } from "../item/ItemLocation";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import type { OwnedItemRow } from "./OwnedItemRow";

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

const OWNED_ITEM_LIMIT = 500;

interface BackpackSlots {
  readonly containerId: string;
  readonly capacity: number;
  readonly occupiedSlots: Set<number>;
}

/**
 * Shared per-transaction item legs for the economy stores: reading owned
 * rows, destroying/creating coin and stackable item rows with optimistic
 * version guards, and auditing each change. Every method must run inside
 * the caller's open transaction.
 */
export class PgCoinOperations {
  private ownedItemCount: number | null = null;

  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly catalog: ItemCatalog,
  ) {}

  async loadOwnedItems(): Promise<OwnedItemRow[]> {
    const owned = await this.client.query<OwnedItemRow>(OWNED_ITEMS_QUERY, [
      this.characterId,
    ]);
    if (owned.rows.length > 500) {
      throw new Error("character has excessive items");
    }
    this.ownedItemCount = owned.rows.length;
    return owned.rows;
  }

  coinRows(rows: ReadonlyArray<OwnedItemRow>): {
    gold: OwnedItemRow[];
    platinum: OwnedItemRow[];
    crystal: OwnedItemRow[];
  } {
    return {
      gold: this.rowsOfType(rows, GOLD_COIN_TYPE_ID),
      platinum: this.rowsOfType(rows, PLATINUM_COIN_TYPE_ID),
      crystal: this.rowsOfType(rows, CRYSTAL_COIN_TYPE_ID),
    };
  }

  rowsOfType(
    rows: ReadonlyArray<OwnedItemRow>,
    itemTypeId: number,
  ): OwnedItemRow[] {
    return rows
      .filter((row) => row.item_type_id === itemTypeId)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  countRows(rows: ReadonlyArray<OwnedItemRow>): number {
    return rows.reduce((total, row) => total + row.count, 0);
  }

  /** Destroys `count` units across the rows, smallest row ids first. */
  async destroyItems(
    rows: ReadonlyArray<OwnedItemRow>,
    count: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: string[],
  ): Promise<void> {
    let remaining = count;
    for (const row of rows) {
      if (remaining === 0) break;
      if (removedItemIds.includes(row.id)) continue;
      const current = after.get(row.id) ?? this.itemFromRow(row);
      const spent = Math.min(current.count, remaining);
      remaining -= spent;
      if (spent === current.count) {
        const deleted = await this.client.query<{ id: string }>(
          "DELETE FROM items WHERE id = $1 AND version = $2 RETURNING id",
          [row.id, current.version],
        );
        if (deleted.rows[0]?.id !== row.id) {
          throw new Error("economy item version is stale");
        }
        removedItemIds.push(row.id);
        after.delete(row.id);
        this.ownedItemCount = this.currentOwnedItemCount() - 1;
      } else {
        const updated = await this.client.query<{ version: number }>(
          `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING version`,
          [row.id, spent, current.version],
        );
        if (updated.rows[0]?.version !== current.version + 1) {
          throw new Error("economy item version is stale");
        }
        after.set(row.id, {
          ...current,
          count: current.count - spent,
          version: current.version + 1,
        });
      }
      await this.client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-destroyed', $1, $2,
           jsonb_build_object(
             'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
           )
         )`,
        [this.characterId, row.id, itemTypeId, spent, reason],
      );
    }
    if (remaining !== 0) throw new Error("economy item balance is stale");
  }

  /**
   * Grants `count` units of a stackable type: tops up existing stacks, then
   * creates new stacks in free backpack slots. Returns false when the slots
   * run out; the caller must roll the whole transaction back.
   */
  async grantStackable(
    rows: ReadonlyArray<OwnedItemRow>,
    count: number,
    itemTypeId: number,
    maxCount: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: ReadonlyArray<string>,
    backpack: BackpackSlots,
  ): Promise<boolean> {
    let remaining = count;
    for (const row of rows) {
      if (remaining === 0) return true;
      if (removedItemIds.includes(row.id)) continue;
      const current = after.get(row.id) ?? this.itemFromRow(row);
      if (current.count > maxCount) {
        throw new Error("economy stack exceeds its item type limit");
      }
      const added = Math.min(maxCount - current.count, remaining);
      if (added === 0) continue;
      const updated = await this.client.query<{ version: number }>(
        `UPDATE items
         SET count = count + $2, version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $3
         RETURNING version`,
        [row.id, added, current.version],
      );
      if (updated.rows[0]?.version !== current.version + 1) {
        throw new Error("economy item version is stale");
      }
      after.set(row.id, {
        ...current,
        count: current.count + added,
        version: current.version + 1,
      });
      await this.auditCreation(row.id, itemTypeId, added, reason);
      remaining -= added;
    }
    while (remaining > 0) {
      const stack = Math.min(maxCount, remaining);
      if (!(await this.createRow(itemTypeId, stack, reason, after, backpack))) {
        return false;
      }
      remaining -= stack;
    }
    return true;
  }

  /**
   * Creates `rowCount` single items of a non-stackable type in free backpack
   * slots. Returns false when the slots run out.
   */
  async grantSingles(
    rowCount: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    backpack: BackpackSlots,
    attributes: Readonly<Record<string, unknown>> = {},
  ): Promise<boolean> {
    for (let index = 0; index < rowCount; index++) {
      if (
        !(await this.createRow(
          itemTypeId,
          1,
          reason,
          after,
          backpack,
          attributes,
        ))
      ) {
        return false;
      }
    }
    return true;
  }

  async lockBackpackSlots(
    after: Map<string, Item>,
  ): Promise<BackpackSlots | null> {
    const equipped = await this.client.query<{
      id: string;
      item_type_id: number;
    }>(
      `SELECT id, item_type_id FROM items
       WHERE character_id = $1
         AND location_type = 'equipment'
         AND equipment_slot = 'backpack'
       FOR UPDATE`,
      [this.characterId],
    );
    const backpack = equipped.rows[0];
    if (!backpack) return null;
    const capacity = this.catalog.require(backpack.item_type_id).containerCapacity;
    if (capacity === undefined) {
      throw new Error("equipped backpack is not a container");
    }
    const occupied = await this.client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE container_id = $1 AND location_type = 'container'
       ORDER BY slot_index
       FOR UPDATE`,
      [backpack.id],
    );
    const occupiedSlots = new Set(occupied.rows.map((row) => row.slot_index));
    if ([...occupiedSlots].some((slot) => slot >= capacity)) {
      throw new Error("backpack contains an out-of-range item");
    }
    const rootItems = await this.client.query<OwnedItemRow>(
      `SELECT id, item_type_id, count, attributes, version, location_type,
              character_id, container_id, slot_index, equipment_slot, seed_key
       FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       ORDER BY slot_index, id
       FOR UPDATE`,
      [this.characterId],
    );
    const freeSlots: number[] = [];
    for (let slot = 0; slot < capacity; slot++) {
      if (!occupiedSlots.has(slot)) freeSlots.push(slot);
    }
    if (freeSlots.length < rootItems.rows.length) return null;
    for (const [index, row] of rootItems.rows.entries()) {
      const slot = freeSlots[index];
      if (slot === undefined) throw new Error("backpack slot plan is invalid");
      const current = this.itemFromRow(row);
      const updated = await this.client.query<{ version: number }>(
        `UPDATE items
         SET location_type = 'container', character_id = null,
             container_id = $2, slot_index = $3,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $4
           AND character_id = $5 AND location_type = 'inventory'
         RETURNING version`,
        [row.id, backpack.id, slot, row.version, this.characterId],
      );
      const version = updated.rows[0]?.version;
      if (version !== row.version + 1) {
        throw new Error("economy inventory location is stale");
      }
      const moved: Item = {
        ...current,
        version,
        location: { kind: "container", containerId: backpack.id, slot },
      };
      after.set(row.id, moved);
      occupiedSlots.add(slot);
      await this.client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES ('item-transferred', $1, $2, $3::jsonb)`,
        [
          this.characterId,
          row.id,
          JSON.stringify({
            from: current.location,
            to: moved.location,
            count: moved.count,
            reason: "economy-inventory-normalization",
          }),
        ],
      );
    }
    return { containerId: backpack.id, capacity, occupiedSlots };
  }

  itemFromRow(row: OwnedItemRow): Item {
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

  private async createRow(
    itemTypeId: number,
    count: number,
    reason: string,
    after: Map<string, Item>,
    backpack: BackpackSlots,
    attributes: Readonly<Record<string, unknown>> = {},
  ): Promise<boolean> {
    const ownedItemCount = this.currentOwnedItemCount();
    if (ownedItemCount >= OWNED_ITEM_LIMIT) return false;
    const slot = this.takeFreeSlot(backpack);
    if (slot === null) return false;
    const itemId = randomUUID();
    await this.client.query(
      `INSERT INTO items (
         id, item_type_id, count, attributes, location_type, container_id,
         slot_index
       ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)`,
      [
        itemId,
        itemTypeId,
        count,
        JSON.stringify(attributes),
        backpack.containerId,
        slot,
      ],
    );
    this.ownedItemCount = ownedItemCount + 1;
    after.set(itemId, {
      id: itemId,
      typeId: itemTypeId,
      count,
      attributes: { ...attributes },
      version: 1,
      location: { kind: "container", containerId: backpack.containerId, slot },
    });
    await this.auditCreation(itemId, itemTypeId, count, reason);
    return true;
  }

  private currentOwnedItemCount(): number {
    if (this.ownedItemCount === null) {
      throw new Error("economy owned items were not loaded");
    }
    return this.ownedItemCount;
  }

  private takeFreeSlot(backpack: BackpackSlots): number | null {
    for (let slot = 0; slot < backpack.capacity; slot++) {
      if (!backpack.occupiedSlots.has(slot)) {
        backpack.occupiedSlots.add(slot);
        return slot;
      }
    }
    return null;
  }

  private async auditCreation(
    itemId: string,
    itemTypeId: number,
    count: number,
    reason: string,
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
         )
       )`,
      [this.characterId, itemId, itemTypeId, count, reason],
    );
  }

  private locationFromRow(row: OwnedItemRow): ItemLocation {
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
    throw new Error(`item ${row.id} has an invalid economy location`);
  }
}
