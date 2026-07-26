import type { Pool, PoolClient } from "pg";
import { FORGE_RULES } from "@tibia/protocol";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { debitBankBalanceQuery } from "../economy/sql/debitBankBalanceQuery";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { OwnedItemRow } from "../economy/OwnedItemRow";
import { countForgeHistoryQuery } from "./sql/countForgeHistoryQuery";
import { debitForgeDustsQuery } from "./sql/debitForgeDustsQuery";
import { deleteForgeItemQuery } from "./sql/deleteForgeItemQuery";
import { ensureForgeResourcesQuery } from "./sql/ensureForgeResourcesQuery";
import { grantForgeDustsQuery } from "./sql/grantForgeDustsQuery";
import { increaseForgeDustLimitQuery } from "./sql/increaseForgeDustLimitQuery";
import { insertForgeAuditQuery } from "./sql/insertForgeAuditQuery";
import { insertForgeHistoryQuery } from "./sql/insertForgeHistoryQuery";
import { insertForgeLedgerQuery } from "./sql/insertForgeLedgerQuery";
import { selectForgeHistoryQuery } from "./sql/selectForgeHistoryQuery";
import { selectForgeResourcesQuery } from "./sql/selectForgeResourcesQuery";
import { updateForgeItemTierQuery } from "./sql/updateForgeItemTierQuery";
import type {
  ForgeConversionRequest,
  ForgeExchangeRequest,
  ForgeHistoryPage,
  ForgeHistoryRow,
  ForgeResourcesRecord,
  ForgeStore,
  ForgeTransactionResult,
} from "./ForgeStore";

interface ResourcesRow {
  dusts: number;
  dust_level: number;
}

interface HistoryRow {
  action: ForgeHistoryRow["action"];
  convergence: boolean;
  success: boolean;
  bonus: number;
  tier: number;
  description: string;
  cost_gold: string;
  cost_dust: number;
  cost_cores: number;
  gained: string;
  created_at_ms: string;
}

export class PgForgeStore implements ForgeStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async load(characterId: string): Promise<ForgeResourcesRecord> {
    await this.pool.query(ensureForgeResourcesQuery, [characterId]);
    const result = await this.pool.query<ResourcesRow>(
      selectForgeResourcesQuery,
      [characterId],
    );
    return this.parseResources(result.rows[0]);
  }

  async grantDusts(
    characterId: string,
    amount: number,
  ): Promise<ForgeResourcesRecord> {
    await this.pool.query(ensureForgeResourcesQuery, [characterId]);
    const result = await this.pool.query<ResourcesRow>(grantForgeDustsQuery, [
      characterId,
      amount,
    ]);
    return this.parseResources(result.rows[0]);
  }

  exchange(
    characterId: string,
    request: ForgeExchangeRequest,
  ): Promise<ForgeTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(ensureForgeResourcesQuery, [characterId]);
      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      if (request.coreCost > 0) {
        const cores = coinOps.rowsOfType(owned, FORGE_RULES.coreItemTypeId);
        if (coinOps.countRows(cores) < request.coreCost) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "insufficient-cores",
          });
        }
        await coinOps.destroyItems(
          cores,
          request.coreCost,
          FORGE_RULES.coreItemTypeId,
          "forge-core",
          after,
          removedItemIds,
        );
      }
      for (const change of request.changes) {
        const updated = await client.query<OwnedItemRow>(
          updateForgeItemTierQuery,
          [change.itemId, change.expectedVersion, change.newTier],
        );
        const row = updated.rows[0];
        if (!row) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "conflict",
          });
        }
        after.set(row.id, coinOps.itemFromRow(row));
      }
      for (const destroy of request.destroyItems) {
        const deleted = await client.query(deleteForgeItemQuery, [
          destroy.itemId,
          destroy.expectedVersion,
        ]);
        if (deleted.rowCount === 0) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "conflict",
          });
        }
        removedItemIds.push(destroy.itemId);
        await client.query(insertForgeAuditQuery, [
          characterId,
          "item-destroyed",
          JSON.stringify({ itemId: destroy.itemId, reason: "forge" }),
        ]);
      }
      const resources = await this.settle(client, characterId, request);
      return {
        status: "committed" as const,
        resources,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  conversion(
    characterId: string,
    request: ForgeConversionRequest,
  ): Promise<ForgeTransactionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(ensureForgeResourcesQuery, [characterId]);
      const after = new Map<string, Item>();
      const removedItemIds: string[] = [];
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      let resources: ForgeResourcesRecord;
      if (request.conversion === "dust-to-slivers") {
        resources = await this.debitDusts(
          client,
          characterId,
          request.history.costDust,
        );
        const backpack = await coinOps.lockBackpackSlots();
        if (!backpack) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "backpack-full",
          });
        }
        const missed = await coinOps.grantStackable(
          coinOps.rowsOfType(owned, FORGE_RULES.sliverItemTypeId),
          FORGE_RULES.sliversPerConversion,
          FORGE_RULES.sliverItemTypeId,
          100,
          "forge-conversion",
          after,
          removedItemIds,
          backpack,
        );
        if (missed > 0) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "backpack-full",
          });
        }
      } else if (request.conversion === "slivers-to-cores") {
        const slivers = coinOps.rowsOfType(owned, FORGE_RULES.sliverItemTypeId);
        if (coinOps.countRows(slivers) < FORGE_RULES.sliverCoreCost) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "insufficient-slivers",
          });
        }
        await coinOps.destroyItems(
          slivers,
          FORGE_RULES.sliverCoreCost,
          FORGE_RULES.sliverItemTypeId,
          "forge-conversion",
          after,
          removedItemIds,
        );
        const backpack = await coinOps.lockBackpackSlots();
        if (!backpack) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "backpack-full",
          });
        }
        const missed = await coinOps.grantStackable(
          coinOps.rowsOfType(owned, FORGE_RULES.coreItemTypeId),
          1,
          FORGE_RULES.coreItemTypeId,
          100,
          "forge-conversion",
          after,
          removedItemIds,
          backpack,
        );
        if (missed > 0) {
          throw new TransactionRollback<ForgeTransactionResult>({
            status: "backpack-full",
          });
        }
        resources = await this.currentResources(client, characterId);
      } else {
        const raised = await client.query<ResourcesRow>(
          increaseForgeDustLimitQuery,
          [characterId, FORGE_RULES.maxDustLimit],
        );
        const row = raised.rows[0];
        if (!row) {
          const current = await this.currentResources(client, characterId);
          throw new TransactionRollback<ForgeTransactionResult>({
            status:
              current.dustLevel >= FORGE_RULES.maxDustLimit
                ? "dust-limit-reached"
                : "insufficient-dust",
          });
        }
        resources = this.parseResources(row);
      }
      await this.writeHistory(client, characterId, request.history);
      await client.query(insertForgeAuditQuery, [
        characterId,
        "forge-conversion",
        JSON.stringify({
          conversion: request.conversion,
          costDust: request.history.costDust,
          gained: request.history.gained,
        }),
      ]);
      return {
        status: "committed" as const,
        resources,
        mutation: { after: [...after.values()], removedItemIds },
      };
    });
  }

  async history(
    characterId: string,
    page: number,
    pageSize: number,
  ): Promise<ForgeHistoryPage> {
    const [entries, total] = await Promise.all([
      this.pool.query<HistoryRow>(selectForgeHistoryQuery, [
        characterId,
        pageSize,
        page * pageSize,
      ]),
      this.pool.query<{ total: number }>(countForgeHistoryQuery, [characterId]),
    ]);
    return {
      entries: entries.rows.map((row) => ({
        action: row.action,
        convergence: row.convergence,
        success: row.success,
        bonus: row.bonus,
        tier: row.tier,
        description: row.description,
        costGold: Number(row.cost_gold),
        costDust: row.cost_dust,
        costCores: row.cost_cores,
        gained: Number(row.gained),
        createdAt: Number(row.created_at_ms),
      })),
      totalEntries: total.rows[0]?.total ?? 0,
    };
  }

  /** Dust + gold legs shared by fusion and transfer, then history + audit. */
  private async settle(
    client: PoolClient,
    characterId: string,
    request: ForgeExchangeRequest,
  ): Promise<ForgeResourcesRecord> {
    let resources: ForgeResourcesRecord;
    if (request.dustCost > 0) {
      resources = await this.debitDusts(client, characterId, request.dustCost);
    } else {
      resources = await this.currentResources(client, characterId);
    }
    if (request.goldCost > 0) {
      const debited = await client.query<{ balance: string }>(
        debitBankBalanceQuery,
        [characterId, request.goldCost],
      );
      if (debited.rowCount === 0) {
        throw new TransactionRollback<ForgeTransactionResult>({
          status: "insufficient-gold",
        });
      }
      await client.query(insertForgeLedgerQuery, [
        characterId,
        request.goldCost,
        Number(debited.rows[0]?.balance ?? 0),
      ]);
    }
    await this.writeHistory(client, characterId, request.history);
    await client.query(insertForgeAuditQuery, [
      characterId,
      request.action === "fusion" ? "forge-fusion" : "forge-transfer",
      JSON.stringify({
        success: request.history.success,
        bonus: request.history.bonus,
        tier: request.history.tier,
        convergence: request.history.convergence,
        costGold: request.goldCost,
        costDust: request.dustCost,
        costCores: request.coreCost,
      }),
    ]);
    return resources;
  }

  private async debitDusts(
    client: PoolClient,
    characterId: string,
    amount: number,
  ): Promise<ForgeResourcesRecord> {
    const debited = await client.query<ResourcesRow>(debitForgeDustsQuery, [
      characterId,
      amount,
    ]);
    const row = debited.rows[0];
    if (!row) {
      throw new TransactionRollback<ForgeTransactionResult>({
        status: "insufficient-dust",
      });
    }
    return this.parseResources(row);
  }

  private async currentResources(
    client: PoolClient,
    characterId: string,
  ): Promise<ForgeResourcesRecord> {
    const result = await client.query<ResourcesRow>(selectForgeResourcesQuery, [
      characterId,
    ]);
    return this.parseResources(result.rows[0]);
  }

  private async writeHistory(
    client: PoolClient,
    characterId: string,
    history: ForgeHistoryRow,
  ): Promise<void> {
    await client.query(insertForgeHistoryQuery, [
      characterId,
      history.action,
      history.convergence,
      history.success,
      history.bonus,
      history.tier,
      history.description,
      history.costGold,
      history.costDust,
      history.costCores,
      history.gained,
    ]);
  }

  private parseResources(row: ResourcesRow | undefined): ForgeResourcesRecord {
    return {
      dusts: row?.dusts ?? 0,
      dustLevel: row?.dust_level ?? FORGE_RULES.initialDustLimit,
    };
  }
}
