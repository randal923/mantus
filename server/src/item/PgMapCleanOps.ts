import type { Pool } from "pg";
import { deleteCleanedWorldItems } from "./sql/deleteCleanedWorldItems";
import { withSerializableTransaction } from "./withSerializableTransaction";

/** Removes the rows behind ground items the periodic map clean swept away. */
export class PgMapCleanOps {
  constructor(private readonly pool: Pool) {}

  async removeCleanedWorldItems(
    itemIds: ReadonlyArray<string>,
  ): Promise<void> {
    if (itemIds.length === 0) return;
    await withSerializableTransaction(this.pool, async (client) => {
      await client.query(deleteCleanedWorldItems, [[...itemIds]]);
    });
  }
}
