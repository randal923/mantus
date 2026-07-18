import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import { itemFromOwnedRow } from "./itemFromOwnedRow";
import type { OwnedItemRow } from "./OwnedItemRow";
import type { OwnedItemTally } from "./OwnedItemTally";
import { decrementItemCountQuery } from "./sql/decrementItemCountQuery";
import { deleteItemRowQuery } from "./sql/deleteItemRowQuery";
import { insertItemDestroyedAuditQuery } from "./sql/insertItemDestroyedAuditQuery";

/**
 * Destroys owned item rows with optimistic version guards, auditing each
 * change. Must run inside the caller's open transaction.
 */
export class OwnedItemDestroyer {
  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    private readonly tally: OwnedItemTally,
  ) {}

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
      const current = after.get(row.id) ?? itemFromOwnedRow(row);
      const spent = Math.min(current.count, remaining);
      remaining -= spent;
      if (spent === current.count) {
        const deleted = await this.client.query<{ id: string }>(
          deleteItemRowQuery,
          [row.id, current.version],
        );
        if (deleted.rows[0]?.id !== row.id) {
          throw new Error("economy item version is stale");
        }
        removedItemIds.push(row.id);
        after.delete(row.id);
        this.tally.decrement();
      } else {
        const updated = await this.client.query<{ version: number }>(
          decrementItemCountQuery,
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
      await this.client.query(insertItemDestroyedAuditQuery, [
        this.characterId,
        row.id,
        itemTypeId,
        spent,
        reason,
      ]);
    }
    if (remaining !== 0) throw new Error("economy item balance is stale");
  }
}
