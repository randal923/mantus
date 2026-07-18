import { DEPOT_LIMITS, type DepotLocation } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "./DepotItemRow";
import type { DepotItemRecord, DepotPage, DepotSnapshot } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import { itemFromRow } from "./itemFromRow";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { browseItemsCountQuery } from "./sql/browseItemsCountQuery";
import { browseItemsPageQuery } from "./sql/browseItemsPageQuery";
import { browseStashCountQuery } from "./sql/browseStashCountQuery";
import { browseStashPageQuery } from "./sql/browseStashPageQuery";

export class DepotBrowseReader {
  constructor(
    private readonly pool: Pool,
    private readonly helper: DepotTxHelper,
  ) {}

  browse(
    characterId: string,
    depotId: number,
    location: DepotLocation,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
  ): Promise<DepotPage> {
    return runSerializableTransaction(this.pool, async (client) => {
      await this.helper.lockMetadata(client, characterId, depotId);
      const snapshot = await this.helper.snapshot(client, characterId, depotId);
      if (location === "stash") {
        return this.browseStash(
          client,
          characterId,
          page,
          matchingItemTypeIds,
          snapshot,
        );
      }
      return this.browseItems(
        client,
        characterId,
        depotId,
        location,
        page,
        matchingItemTypeIds,
        snapshot,
      );
    });
  }

  private async browseItems(
    client: PoolClient,
    characterId: string,
    depotId: number,
    location: "depot" | "inbox",
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
    snapshot: DepotSnapshot,
  ): Promise<DepotPage> {
    if (matchingItemTypeIds?.length === 0) {
      return { snapshot, totalEntries: 0, entries: [] };
    }
    const parameters = [
      characterId,
      depotId,
      matchingItemTypeIds ?? [],
    ];
    const total = await client.query<{ count: string }>(
      browseItemsCountQuery(location, matchingItemTypeIds),
      parameters,
    );
    const totalEntries = Number(total.rows[0]?.count ?? 0);
    const offset = (page - 1) * DEPOT_LIMITS.pageSize;
    const selected = await client.query<DepotItemRow>(
      browseItemsPageQuery(location, matchingItemTypeIds),
      [...parameters, DEPOT_LIMITS.pageSize, offset],
    );
    const containedCounts = await this.helper.containedCounts(
      client,
      selected.rows.map((row) => row.id),
    );
    const entries: DepotItemRecord[] = selected.rows.map((row) => {
      if (row.slot_index === null) {
        throw new Error(`stored item ${row.id} has no slot`);
      }
      return {
        location,
        slot: row.slot_index,
        item: itemFromRow(row),
        containedItemCount: containedCounts.get(row.id) ?? 0,
      };
    });
    return { snapshot, totalEntries, entries };
  }

  private async browseStash(
    client: PoolClient,
    characterId: string,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
    snapshot: DepotSnapshot,
  ): Promise<DepotPage> {
    if (matchingItemTypeIds?.length === 0) {
      return { snapshot, totalEntries: 0, entries: [] };
    }
    const parameters = [characterId, matchingItemTypeIds ?? []];
    const total = await client.query<{ count: string }>(
      browseStashCountQuery(matchingItemTypeIds),
      parameters,
    );
    const rows = await client.query<{ item_type_id: number; count: string }>(
      browseStashPageQuery(matchingItemTypeIds),
      [
        ...parameters,
        DEPOT_LIMITS.pageSize,
        (page - 1) * DEPOT_LIMITS.pageSize,
      ],
    );
    return {
      snapshot,
      totalEntries: Number(total.rows[0]?.count ?? 0),
      entries: rows.rows.map((row) => ({
        location: "stash" as const,
        itemTypeId: row.item_type_id,
        count: Number(row.count),
      })),
    };
  }
}
