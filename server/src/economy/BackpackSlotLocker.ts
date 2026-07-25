import type { PoolClient } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { BackpackContainer, BackpackSlots } from "./BackpackSlots";
import { lockBackpackQuery } from "./sql/lockBackpackQuery";

interface LockedRow {
  readonly id: string;
  readonly item_type_id: number;
  readonly container_id: string | null;
  readonly slot_index: number | null;
}

/**
 * Locks the equipped backpack and its nested containers, then reports their
 * free-slot state for grants. Must run inside the caller's open transaction.
 */
export class BackpackSlotLocker {
  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly catalog: ItemCatalog,
  ) {}

  async lock(): Promise<BackpackSlots | null> {
    const locked = await this.client.query<LockedRow>(lockBackpackQuery, [
      this.characterId,
    ]);
    const root = locked.rows.find((row) => row.container_id === null);
    if (!root) return null;
    const childrenByContainer = new Map<string, LockedRow[]>();
    for (const row of locked.rows) {
      if (row.container_id === null) continue;
      const siblings = childrenByContainer.get(row.container_id) ?? [];
      siblings.push(row);
      childrenByContainer.set(row.container_id, siblings);
    }
    const containers: BackpackContainer[] = [];
    this.collect(root, childrenByContainer, containers);
    if (containers.length === 0) {
      throw new Error("equipped backpack is not a container");
    }
    return { containers };
  }

  /** Depth-first in slot order, so grants fill the backpack before its bags. */
  private collect(
    row: LockedRow,
    childrenByContainer: ReadonlyMap<string, ReadonlyArray<LockedRow>>,
    containers: BackpackContainer[],
  ): void {
    const capacity = this.catalog.require(row.item_type_id).containerCapacity;
    if (capacity === undefined) return;
    const children = [...(childrenByContainer.get(row.id) ?? [])].sort(
      (left, right) => (left.slot_index ?? 0) - (right.slot_index ?? 0),
    );
    const occupiedSlots = new Set(
      children.flatMap((child) =>
        child.slot_index === null ? [] : [child.slot_index],
      ),
    );
    if ([...occupiedSlots].some((slot) => slot >= capacity)) {
      throw new Error("backpack contains an out-of-range item");
    }
    containers.push({ containerId: row.id, capacity, occupiedSlots });
    for (const child of children) {
      this.collect(child, childrenByContainer, containers);
    }
  }
}
