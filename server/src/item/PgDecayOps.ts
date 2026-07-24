import type { Pool, PoolClient } from "pg";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemLocks } from "./PgItemLocks";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireVersion } from "./requireVersion";
import { decayTransformUpdate } from "./sql/decayTransformUpdate";
import { deleteItemById } from "./sql/deleteItemById";
import { deleteItemsByIds } from "./sql/deleteItemsByIds";
import { doomedContainedItemsQuery } from "./sql/doomedContainedItemsQuery";
import { insertDecayContentDestroyedAudit } from "./sql/insertDecayContentDestroyedAudit";
import { insertDecayTransformAudit } from "./sql/insertDecayTransformAudit";
import { withSerializableTransaction } from "./withSerializableTransaction";

export class PgDecayOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly locks: PgItemLocks,
    private readonly audit: PgItemAudit,
  ) {}

  decayWorldItem(
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      if (row.location_type !== "world") {
        throw new Error("item is not on the map");
      }
      const decay = this.catalog.require(row.item_type_id).decay;
      if (!decay || decay.durationSeconds === undefined) {
        throw new Error("item does not decay");
      }
      const before = itemFromRow(row);
      const targetTypeId = decay.targetId || undefined;
      if (targetTypeId === undefined) {
        const removed = await this.destroyContainedItems(client, row.id, 0);
        await client.query(deleteItemById, [row.id]);
        await this.audit.decayDestruction(client, before);
        return {
          before,
          after: [],
          removedItemIds: [row.id, ...removed],
        };
      }
      const capacity =
        this.catalog.require(targetTypeId).containerCapacity ?? 0;
      const removedItemIds = await this.destroyContainedItems(
        client,
        row.id,
        capacity,
      );
      const result = await client.query<ItemRow>(decayTransformUpdate, [
        row.id,
        targetTypeId,
      ]);
      const after = requireReturnedItem(result.rows[0]);
      await client.query(insertDecayTransformAudit, [
        row.id,
        row.item_type_id,
        targetTypeId,
      ]);
      return { before, after: [after], removedItemIds };
    });
  }

  /**
   * Deletes and audits the contents a decayed container can no longer hold:
   * direct children in slots >= keepSlots and their entire subtrees.
   */
  private async destroyContainedItems(
    client: PoolClient,
    containerId: string,
    keepSlots: number,
  ): Promise<string[]> {
    const doomed = await client.query<{
      id: string;
      item_type_id: number;
      count: number;
    }>(doomedContainedItemsQuery, [containerId, keepSlots]);
    if (doomed.rows.length === 0) return [];
    await client.query(deleteItemsByIds, [doomed.rows.map((row) => row.id)]);
    await client.query(insertDecayContentDestroyedAudit, [
      doomed.rows.map((row) => row.id),
      doomed.rows.map((row) => row.item_type_id),
      doomed.rows.map((row) => row.count),
    ]);
    return doomed.rows.map((row) => row.id);
  }
}
