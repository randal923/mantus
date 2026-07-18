import type { Pool, PoolClient } from "pg";
import type {
  CarriedPersistAudit,
  CarriedPersistPlan,
} from "./CarriedPersistPlan";
import { itemLocationColumns } from "./itemLocationColumns";
import { insertItemMergedAudit } from "./sql/insertItemMergedAudit";
import { insertItemSplitAudit } from "./sql/insertItemSplitAudit";
import { insertItemTransferredAudit } from "./sql/insertItemTransferredAudit";
import { insertItemTransformedAudit } from "./sql/insertItemTransformedAudit";
import { insertItemWrittenAudit } from "./sql/insertItemWrittenAudit";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { persistCarriedDelete } from "./sql/persistCarriedDelete";
import { persistCarriedInsert } from "./sql/persistCarriedInsert";
import { persistCarriedWriteUpdate } from "./sql/persistCarriedWriteUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

/**
 * Writes a committed in-memory carried-item mutation to the DB as one
 * transaction. Guarded ops that miss (0 rows) throw: memory and DB have
 * diverged and the caller must resync the character from the DB.
 */
export class PgItemPersistOps {
  constructor(private readonly pool: Pool) {}

  persist(plan: CarriedPersistPlan): Promise<void> {
    return withSerializableTransaction(this.pool, async (client) => {
      await client.query(lockCharacterQuery, [plan.characterId]);
      for (const op of plan.rowOps) {
        if (op.kind === "insert") {
          const columns = itemLocationColumns(op.item);
          await client.query(persistCarriedInsert, [
            op.item.id,
            op.item.typeId,
            op.item.count,
            JSON.stringify(op.item.attributes),
            op.item.version,
            columns.locationType,
            columns.characterId,
            columns.containerId,
            columns.slotIndex,
            columns.equipmentSlot,
          ]);
          continue;
        }
        if (op.kind === "delete") {
          const deleted = await client.query(persistCarriedDelete, [
            op.itemId,
            op.expectedVersion,
          ]);
          if (deleted.rowCount !== 1) {
            throw new Error(
              `carried persist delete missed item ${op.itemId}@${op.expectedVersion}`,
            );
          }
          continue;
        }
        const columns = itemLocationColumns(op.item);
        const written = await client.query(persistCarriedWriteUpdate, [
          op.item.id,
          op.item.typeId,
          op.item.count,
          JSON.stringify(op.item.attributes),
          op.item.version,
          columns.locationType,
          columns.characterId,
          columns.containerId,
          columns.slotIndex,
          columns.equipmentSlot,
          op.expectedVersion,
        ]);
        if (written.rowCount !== 1) {
          throw new Error(
            `carried persist write missed item ${op.item.id}@${op.expectedVersion}`,
          );
        }
      }
      for (const audit of plan.audits) {
        await this.insertAudit(client, plan.characterId, audit);
      }
    });
  }

  private async insertAudit(
    client: PoolClient,
    characterId: string,
    audit: CarriedPersistAudit,
  ): Promise<void> {
    if (audit.kind === "transfer") {
      await client.query(insertItemTransferredAudit, [
        characterId,
        audit.itemId,
        JSON.stringify({ from: audit.from, to: audit.to, count: audit.count }),
      ]);
      return;
    }
    if (audit.kind === "merge") {
      await client.query(insertItemMergedAudit, [
        characterId,
        audit.survivorItemId,
        audit.sourceItemId,
        audit.movedCount,
        audit.sourceRemaining,
        audit.resultCount,
      ]);
      return;
    }
    if (audit.kind === "split") {
      await client.query(insertItemSplitAudit, [
        characterId,
        audit.itemId,
        JSON.stringify({
          originalCount: audit.originalCount,
          remainingCount: audit.remainingCount,
          createdItemId: audit.createdItemId,
          createdCount: audit.createdCount,
          destination: audit.destination,
        }),
      ]);
      return;
    }
    if (audit.kind === "transform") {
      await client.query(insertItemTransformedAudit, [
        characterId,
        audit.itemId,
        audit.fromTypeId,
        audit.toTypeId,
      ]);
      return;
    }
    await client.query(insertItemWrittenAudit, [
      characterId,
      audit.itemId,
      audit.previousLength,
      audit.length,
    ]);
  }
}
