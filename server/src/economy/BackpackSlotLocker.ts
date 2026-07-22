import type { PoolClient } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { BackpackSlots } from "./BackpackSlots";
import { lockBackpackSlotIndexesQuery } from "./sql/lockBackpackSlotIndexesQuery";
import { lockEquippedBackpackQuery } from "./sql/lockEquippedBackpackQuery";

/**
 * Locks the equipped backpack and reports its free-slot state for grants.
 * Must run inside the caller's open transaction.
 */
export class BackpackSlotLocker {
  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly catalog: ItemCatalog,
  ) {}

  async lock(): Promise<BackpackSlots | null> {
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
    return { containerId: backpack.id, capacity, occupiedSlots };
  }
}
