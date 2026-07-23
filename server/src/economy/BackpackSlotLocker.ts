import type { PoolClient } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { BackpackSlots } from "./BackpackSlots";
import { lockBackpackQuery } from "./sql/lockBackpackQuery";

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
    const locked = await this.client.query<{
      id: string;
      item_type_id: number;
      slot_index: number | null;
    }>(lockBackpackQuery, [this.characterId]);
    const backpack = locked.rows[0];
    if (!backpack) return null;
    const capacity = this.catalog.require(backpack.item_type_id).containerCapacity;
    if (capacity === undefined) {
      throw new Error("equipped backpack is not a container");
    }
    const occupiedSlots = new Set(
      locked.rows.flatMap((row) =>
        row.slot_index === null ? [] : [row.slot_index],
      ),
    );
    if ([...occupiedSlots].some((slot) => slot >= capacity)) {
      throw new Error("backpack contains an out-of-range item");
    }
    return { containerId: backpack.id, capacity, occupiedSlots };
  }
}
