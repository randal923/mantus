import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { BackpackSlots } from "./BackpackSlots";
import { itemFromOwnedRow } from "./itemFromOwnedRow";
import type { OwnedItemRow } from "./OwnedItemRow";
import type { OwnedItemTally } from "./OwnedItemTally";
import { createOwnedItemsWithAuditQuery } from "./sql/createOwnedItemsWithAuditQuery";
import { createOwnedItemWithAuditQuery } from "./sql/createOwnedItemWithAuditQuery";
import { incrementOwnedItemWithAuditQuery } from "./sql/incrementOwnedItemWithAuditQuery";

const OWNED_ITEM_LIMIT = 500;

/**
 * Grants item rows by topping up stacks with optimistic version guards and
 * creating new rows in free backpack slots, auditing each change. Must run
 * inside the caller's open transaction.
 */
export class OwnedItemGranter {
  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly tally: OwnedItemTally,
  ) {}

  /**
   * Grants `count` units of a stackable type: tops up existing stacks, then
   * creates new stacks in free backpack slots. Returns how many units did not
   * fit (0 when all were granted). Callers that need all-or-nothing must roll
   * the whole transaction back on a non-zero remainder — the rows placed so
   * far are already written.
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
  ): Promise<number> {
    let remaining = count;
    for (const row of rows) {
      if (remaining === 0) return 0;
      if (removedItemIds.includes(row.id)) continue;
      const current = after.get(row.id) ?? itemFromOwnedRow(row);
      if (current.count > maxCount) {
        throw new Error("economy stack exceeds its item type limit");
      }
      const added = Math.min(maxCount - current.count, remaining);
      if (added === 0) continue;
      const updated = await this.client.query<{ version: number }>(
        incrementOwnedItemWithAuditQuery,
        [
          row.id,
          added,
          current.version,
          this.characterId,
          itemTypeId,
          reason,
        ],
      );
      if (updated.rows[0]?.version !== current.version + 1) {
        throw new Error("economy item version is stale");
      }
      after.set(row.id, {
        ...current,
        count: current.count + added,
        version: current.version + 1,
      });
      remaining -= added;
    }
    while (remaining > 0) {
      const stack = Math.min(maxCount, remaining);
      if (!(await this.createRow(itemTypeId, stack, reason, after, backpack))) {
        return remaining;
      }
      remaining -= stack;
    }
    return 0;
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
    if (this.tally.current() + rowCount > OWNED_ITEM_LIMIT) return false;
    const items: Array<{ id: string; containerId: string; slot: number }> = [];
    for (let index = 0; index < rowCount; index++) {
      const destination = this.takeFreeSlot(backpack);
      if (!destination) return false;
      items.push({ id: randomUUID(), ...destination });
    }
    // One insert per destination container; grants that stay inside the
    // equipped backpack still make exactly one round trip.
    for (const containerId of new Set(items.map((item) => item.containerId))) {
      const batch = items.filter((item) => item.containerId === containerId);
      const created = await this.client.query<{ id: string }>(
        createOwnedItemsWithAuditQuery,
        [
          batch.map((item) => item.id),
          batch.map((item) => item.slot),
          itemTypeId,
          JSON.stringify(attributes),
          containerId,
          this.characterId,
          reason,
        ],
      );
      if (
        created.rows.length !== batch.length ||
        batch.some(
          (item) =>
            !created.rows.some((createdItem) => createdItem.id === item.id),
        )
      ) {
        throw new Error("economy item creation was incomplete");
      }
    }
    for (const item of items) {
      this.tally.increment();
      after.set(item.id, {
        id: item.id,
        typeId: itemTypeId,
        count: 1,
        attributes: { ...attributes },
        version: 1,
        location: {
          kind: "container",
          containerId: item.containerId,
          slot: item.slot,
        },
      });
    }
    return true;
  }

  private async createRow(
    itemTypeId: number,
    count: number,
    reason: string,
    after: Map<string, Item>,
    backpack: BackpackSlots,
    attributes: Readonly<Record<string, unknown>> = {},
  ): Promise<boolean> {
    if (this.tally.current() >= OWNED_ITEM_LIMIT) return false;
    const destination = this.takeFreeSlot(backpack);
    if (!destination) return false;
    const itemId = randomUUID();
    const created = await this.client.query<{ id: string }>(
      createOwnedItemWithAuditQuery,
      [
        itemId,
        itemTypeId,
        count,
        JSON.stringify(attributes),
        destination.containerId,
        destination.slot,
        this.characterId,
        reason,
      ],
    );
    if (created.rows[0]?.id !== itemId) {
      throw new Error("economy item creation was incomplete");
    }
    this.tally.increment();
    after.set(itemId, {
      id: itemId,
      typeId: itemTypeId,
      count,
      attributes: { ...attributes },
      version: 1,
      location: {
        kind: "container",
        containerId: destination.containerId,
        slot: destination.slot,
      },
    });
    return true;
  }

  /** First free slot in fill order: the backpack, then its nested bags. */
  private takeFreeSlot(
    backpack: BackpackSlots,
  ): { containerId: string; slot: number } | null {
    for (const container of backpack.containers) {
      for (let slot = 0; slot < container.capacity; slot++) {
        if (container.occupiedSlots.has(slot)) continue;
        container.occupiedSlots.add(slot);
        return { containerId: container.containerId, slot };
      }
    }
    return null;
  }
}
