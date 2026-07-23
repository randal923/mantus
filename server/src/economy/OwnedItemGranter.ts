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
    if (this.tally.current() + rowCount > OWNED_ITEM_LIMIT) return false;
    const items: Array<{ id: string; slot: number }> = [];
    for (let index = 0; index < rowCount; index++) {
      const slot = this.takeFreeSlot(backpack);
      if (slot === null) return false;
      items.push({ id: randomUUID(), slot });
    }
    const created = await this.client.query<{ id: string }>(
      createOwnedItemsWithAuditQuery,
      [
        items.map((item) => item.id),
        items.map((item) => item.slot),
        itemTypeId,
        JSON.stringify(attributes),
        backpack.containerId,
        this.characterId,
        reason,
      ],
    );
    if (
      created.rows.length !== items.length ||
      items.some(
        (item) => !created.rows.some((createdItem) => createdItem.id === item.id),
      )
    ) {
      throw new Error("economy item creation was incomplete");
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
          containerId: backpack.containerId,
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
    const slot = this.takeFreeSlot(backpack);
    if (slot === null) return false;
    const itemId = randomUUID();
    const created = await this.client.query<{ id: string }>(
      createOwnedItemWithAuditQuery,
      [
        itemId,
        itemTypeId,
        count,
        JSON.stringify(attributes),
        backpack.containerId,
        slot,
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
      location: { kind: "container", containerId: backpack.containerId, slot },
    });
    return true;
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
}
