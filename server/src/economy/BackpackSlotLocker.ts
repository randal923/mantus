import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { BackpackSlots } from "./BackpackSlots";
import { itemFromOwnedRow } from "./itemFromOwnedRow";
import type { OwnedItemRow } from "./OwnedItemRow";
import { insertItemTransferredAuditQuery } from "./sql/insertItemTransferredAuditQuery";
import { lockBackpackSlotIndexesQuery } from "./sql/lockBackpackSlotIndexesQuery";
import { lockEquippedBackpackQuery } from "./sql/lockEquippedBackpackQuery";
import { lockRootInventoryItemsQuery } from "./sql/lockRootInventoryItemsQuery";
import { moveInventoryItemToBackpackQuery } from "./sql/moveInventoryItemToBackpackQuery";

/**
 * Locks the equipped backpack and its contents, normalizes loose inventory
 * items into it, and reports the free-slot state for subsequent grants.
 * Must run inside the caller's open transaction.
 */
export class BackpackSlotLocker {
  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly catalog: ItemCatalog,
  ) {}

  async lock(after: Map<string, Item>): Promise<BackpackSlots | null> {
    const equipped = await this.client.query<{
      id: string;
      item_type_id: number;
    }>(lockEquippedBackpackQuery, [this.characterId]);
    const backpack = equipped.rows[0];
    if (!backpack) return null;
    const capacity = this.catalog.require(backpack.item_type_id).containerCapacity;
    if (capacity === undefined) {
      throw new Error("equipped backpack is not a container");
    }
    const occupied = await this.client.query<{ slot_index: number }>(
      lockBackpackSlotIndexesQuery,
      [backpack.id],
    );
    const occupiedSlots = new Set(occupied.rows.map((row) => row.slot_index));
    if ([...occupiedSlots].some((slot) => slot >= capacity)) {
      throw new Error("backpack contains an out-of-range item");
    }
    const rootItems = await this.client.query<OwnedItemRow>(
      lockRootInventoryItemsQuery,
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
      const current = itemFromOwnedRow(row);
      const updated = await this.client.query<{ version: number }>(
        moveInventoryItemToBackpackQuery,
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
      await this.client.query(insertItemTransferredAuditQuery, [
        this.characterId,
        row.id,
        JSON.stringify({
          from: current.location,
          to: moved.location,
          count: moved.count,
          reason: "economy-inventory-normalization",
        }),
      ]);
    }
    return { containerId: backpack.id, capacity, occupiedSlots };
  }
}
