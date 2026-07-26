import type { Pool } from "pg";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { OwnedItemRow } from "../economy/OwnedItemRow";
import { insertImbuementAuditQuery } from "./sql/insertImbuementAuditQuery";
import { insertImbuementLedgerQuery } from "./sql/insertImbuementLedgerQuery";
import { updateImbuedItemQuery } from "./sql/updateImbuedItemQuery";
import type {
  ImbuementMutationRequest,
  ImbuementMutationResult,
  ImbuementStore,
} from "./ImbuementStore";

export class PgImbuementStore implements ImbuementStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  mutate(
    characterId: string,
    request: ImbuementMutationRequest,
  ): Promise<ImbuementMutationResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      if (request.materials.length > 0) {
        const owned = await coinOps.loadOwnedItems();
        for (const material of request.materials) {
          const rows = coinOps.rowsOfType(owned, material.itemTypeId);
          if (coinOps.countRows(rows) < material.count) {
            throw new TransactionRollback<ImbuementMutationResult>({
              status: "insufficient-materials",
            });
          }
          await coinOps.destroyItems(
            rows,
            material.count,
            material.itemTypeId,
            "imbuement",
            after,
            removedItemIds,
          );
        }
      }
      if (request.goldCost > 0) {
        const debited = await client.query<{ balance: string }>(
          debitBankBalanceQuery,
          [characterId, request.goldCost],
        );
        if (debited.rowCount === 0) {
          throw new TransactionRollback<ImbuementMutationResult>({
            status: "insufficient-gold",
          });
        }
        await client.query(insertImbuementLedgerQuery, [
          characterId,
          request.goldCost,
          Number(debited.rows[0]?.balance ?? 0),
        ]);
      }
      const updated = await client.query<OwnedItemRow>(updateImbuedItemQuery, [
        request.itemId,
        request.expectedVersion,
        JSON.stringify(request.attributes),
      ]);
      const row = updated.rows[0];
      if (!row) {
        throw new TransactionRollback<ImbuementMutationResult>({
          status: "conflict",
        });
      }
      after.set(row.id, coinOps.itemFromRow(row));
      await client.query(insertImbuementAuditQuery, [
        characterId,
        request.auditEvent,
        JSON.stringify(request.auditDetails),
      ]);
      return {
        status: "committed" as const,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }
}
