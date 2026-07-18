import type { Pool, PoolClient } from "pg";
import type { DepotPersistAudit, DepotPersistPlan } from "./DepotPersistPlan";
import { itemLocationColumns } from "../item/itemLocationColumns";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { claimDeliveriesForItemUpdate } from "./sql/claimDeliveriesForItemUpdate";
import { bumpInboxRevisionUpdate } from "./sql/bumpInboxRevisionUpdate";
import { bumpStashRevisionUpdate } from "./sql/bumpStashRevisionUpdate";
import { deleteStashRow } from "./sql/deleteStashRow";
import { depositDepotRevisionUpdate } from "./sql/depositDepotRevisionUpdate";
import { ensureDepotRowInsert } from "./sql/ensureDepotRowInsert";
import { ensureStorageStateInsert } from "./sql/ensureStorageStateInsert";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { mergeAuditInsert } from "./sql/mergeAuditInsert";
import { persistItemDelete } from "./sql/persistItemDelete";
import { persistItemInsert } from "./sql/persistItemInsert";
import { persistItemWriteUpdate } from "./sql/persistItemWriteUpdate";
import { stashDepositAuditInsert } from "./sql/stashDepositAuditInsert";
import { stashUpsertInsert } from "./sql/stashUpsertInsert";
import { stashWithdrawAuditInsert } from "./sql/stashWithdrawAuditInsert";
import { transferAuditInsert } from "./sql/transferAuditInsert";

/**
 * Writes a committed in-memory depot mutation to the DB as one transaction.
 * Guarded ops that miss (0 rows) throw: memory and DB have diverged and the
 * caller must resync the character from the DB.
 */
export class DepotPersistOps {
  constructor(private readonly pool: Pool) {}

  persist(plan: DepotPersistPlan): Promise<void> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(lockCharacterQuery, [plan.characterId]);
      await client.query(ensureStorageStateInsert, [plan.characterId]);
      for (const bump of plan.revisionBumps) {
        if (bump.kind === "depot") {
          await client.query(ensureDepotRowInsert, [
            plan.characterId,
            bump.depotId,
          ]);
        }
      }
      for (const op of plan.rowOps) {
        if (op.kind === "insert") {
          const columns = itemLocationColumns(op.item);
          await client.query(persistItemInsert, [
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
            columns.depotId,
          ]);
          continue;
        }
        if (op.kind === "delete") {
          const deleted = await client.query(persistItemDelete, [
            op.itemId,
            op.expectedVersion,
          ]);
          if (deleted.rowCount !== 1) {
            throw new Error(
              `depot persist delete missed item ${op.itemId}@${op.expectedVersion}`,
            );
          }
          continue;
        }
        const columns = itemLocationColumns(op.item);
        const written = await client.query(persistItemWriteUpdate, [
          op.item.id,
          op.item.count,
          op.item.version,
          columns.locationType,
          columns.characterId,
          columns.containerId,
          columns.slotIndex,
          columns.equipmentSlot,
          columns.depotId,
          op.expectedVersion,
        ]);
        if (written.rowCount !== 1) {
          throw new Error(
            `depot persist write missed item ${op.item.id}@${op.expectedVersion}`,
          );
        }
      }
      for (const stashOp of plan.stashOps) {
        if (stashOp.count > 0) {
          await client.query(stashUpsertInsert, [
            plan.characterId,
            stashOp.itemTypeId,
            stashOp.count,
          ]);
          continue;
        }
        await client.query(deleteStashRow, [
          plan.characterId,
          stashOp.itemTypeId,
        ]);
      }
      for (const itemId of plan.claimDeliveryItemIds) {
        await client.query(claimDeliveriesForItemUpdate, [itemId]);
      }
      for (const bump of plan.revisionBumps) {
        if (bump.kind === "depot") {
          await client.query(depositDepotRevisionUpdate, [
            plan.characterId,
            bump.depotId,
          ]);
          continue;
        }
        if (bump.kind === "inbox") {
          await client.query(bumpInboxRevisionUpdate, [plan.characterId]);
          continue;
        }
        await client.query(bumpStashRevisionUpdate, [plan.characterId]);
      }
      for (const audit of plan.audits) {
        await this.insertAudit(client, plan.characterId, audit);
      }
    });
  }

  private async insertAudit(
    client: PoolClient,
    characterId: string,
    audit: DepotPersistAudit,
  ): Promise<void> {
    if (audit.kind === "transfer") {
      await client.query(transferAuditInsert, [
        characterId,
        audit.itemId,
        audit.operation,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
      ]);
      return;
    }
    if (audit.kind === "merge") {
      await client.query(mergeAuditInsert, [
        characterId,
        audit.survivorItemId,
        audit.sourceItemId,
        audit.movedCount,
        audit.sourceRemaining,
        audit.resultCount,
        audit.operation,
      ]);
      return;
    }
    if (audit.kind === "stash-deposit") {
      await client.query(stashDepositAuditInsert, [
        characterId,
        audit.itemId,
        audit.itemTypeId,
        audit.count,
      ]);
      return;
    }
    await client.query(stashWithdrawAuditInsert, [
      characterId,
      audit.itemId,
      audit.itemTypeId,
      audit.count,
    ]);
  }
}
