import type { Pool, PoolClient } from "pg";
import type {
  CarriedPersistAudit,
  CarriedPersistPlan,
} from "./CarriedPersistPlan";
import { itemLocationColumns } from "./itemLocationColumns";
import { insertItemMergedAudit } from "./sql/insertItemMergedAudit";
import { insertItemDestroyedAudit } from "./sql/insertItemDestroyedAudit";
import { insertItemSplitAudit } from "./sql/insertItemSplitAudit";
import { insertItemTransferredAudit } from "./sql/insertItemTransferredAudit";
import { insertItemTransformedAudit } from "./sql/insertItemTransformedAudit";
import { insertItemWrittenAudit } from "./sql/insertItemWrittenAudit";
import { insertLootCreatedAudit } from "./sql/insertLootCreatedAudit";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { persistCarriedDelete } from "./sql/persistCarriedDelete";
import { persistCarriedInsert } from "./sql/persistCarriedInsert";
import { persistCarriedStageUpdate } from "./sql/persistCarriedStageUpdate";
import { persistCarriedWriteUpdate } from "./sql/persistCarriedWriteUpdate";
import { persistSeededInsert } from "./sql/persistSeededInsert";
import { withSerializableTransaction } from "./withSerializableTransaction";

/**
 * Writes a committed in-memory carried-item mutation to the DB as one
 * transaction. Guarded ops that miss (0 rows) throw: memory and DB have
 * diverged and the caller must resync the character from the DB.
 */
export class PgItemPersistOps {
  constructor(
    private readonly pool: Pool,
    private readonly mapName: string,
  ) {}

  persist(plan: CarriedPersistPlan): Promise<void> {
    return withSerializableTransaction(this.pool, async (client) => {
      await client.query(lockCharacterQuery, [plan.characterId]);
      for (const op of plan.rowOps) {
        if (op.kind === "stage") {
          const staged = await client.query(persistCarriedStageUpdate, [
            op.itemId,
            op.expectedVersion,
            op.nextVersion,
            op.characterId,
            op.slot,
          ]);
          if (staged.rowCount !== 1) {
            throw new Error(
              `carried persist stage missed item ${op.itemId}@${op.expectedVersion}`,
            );
          }
          continue;
        }
        if (op.kind === "insert") {
          const columns = itemLocationColumns(op.item, this.mapName);
          if (op.seed) {
            await client.query(persistSeededInsert, [
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
              columns.worldMapName,
              columns.worldX,
              columns.worldY,
              columns.worldZ,
              columns.worldStackIndex,
              op.item.seedKey ?? null,
              op.seed.mapName,
              op.seed.mapVersion,
              op.seed.x,
              op.seed.y,
              op.seed.z,
              op.seed.stackIndex,
            ]);
            continue;
          }
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
            columns.worldMapName,
            columns.worldX,
            columns.worldY,
            columns.worldZ,
            columns.worldStackIndex,
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
        const columns = itemLocationColumns(op.item, this.mapName);
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
          columns.worldMapName,
          columns.worldX,
          columns.worldY,
          columns.worldZ,
          columns.worldStackIndex,
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
    if (audit.kind === "destruction") {
      await client.query(insertItemDestroyedAudit, [
        characterId,
        audit.itemId,
        audit.typeId,
        audit.count,
        audit.reason,
      ]);
      return;
    }
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
    if (audit.kind === "loot-created") {
      await client.query(insertLootCreatedAudit, [
        audit.killerCharacterId,
        audit.itemId,
        audit.eventId,
        audit.typeId,
        audit.count,
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
