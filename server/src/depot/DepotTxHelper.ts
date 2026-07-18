import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { DepotItemRow } from "./DepotItemRow";
import type { DepotStateRow } from "./DepotStateRow";
import type { DepotSnapshot } from "./DepotStore";
import type { InventoryDestination } from "./InventoryDestination";
import type { StorageStateRow } from "./StorageStateRow";
import { carriedItemsQuery } from "./sql/carriedItemsQuery";
import { containedCountsQuery } from "./sql/containedCountsQuery";
import { containerSlotsForUpdateQuery } from "./sql/containerSlotsForUpdateQuery";
import { depotRevisionForUpdateQuery } from "./sql/depotRevisionForUpdateQuery";
import { depotRevisionQuery } from "./sql/depotRevisionQuery";
import { ensureDepotRowInsert } from "./sql/ensureDepotRowInsert";
import { ensureStorageStateInsert } from "./sql/ensureStorageStateInsert";
import { equippedBackpackQuery } from "./sql/equippedBackpackQuery";
import { firstFreeSlotQuery } from "./sql/firstFreeSlotQuery";
import { heldItemCountQuery } from "./sql/heldItemCountQuery";
import { inventorySlotsForUpdateQuery } from "./sql/inventorySlotsForUpdateQuery";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { lockItemQuery } from "./sql/lockItemQuery";
import { lockSubtreeQuery } from "./sql/lockSubtreeQuery";
import { mergeAuditInsert } from "./sql/mergeAuditInsert";
import { ownershipRootQuery } from "./sql/ownershipRootQuery";
import { stashTotalCountQuery } from "./sql/stashTotalCountQuery";
import { storageStateForUpdateQuery } from "./sql/storageStateForUpdateQuery";
import { storageStateQuery } from "./sql/storageStateQuery";
import { transferAuditInsert } from "./sql/transferAuditInsert";

export class DepotTxHelper {
  constructor(private readonly catalog: ItemCatalog) {}

  async lockMetadata(
    client: PoolClient,
    characterId: string,
    depotId: number,
  ): Promise<{
    depotRevision: number;
    inboxRevision: number;
    stashRevision: number;
    depotCount: number;
  }> {
    if (!Number.isInteger(depotId) || depotId < 1 || depotId > 65_535) {
      throw new Error("depot id is out of range");
    }
    const character = await client.query<{ id: string }>(lockCharacterQuery, [
      characterId,
    ]);
    if (!character.rows[0]) throw new Error("character not found");
    await client.query(ensureDepotRowInsert, [characterId, depotId]);
    await this.ensureStorageState(client, characterId);
    const depot = await client.query<DepotStateRow>(
      depotRevisionForUpdateQuery,
      [characterId, depotId],
    );
    const storage = await client.query<StorageStateRow>(
      storageStateForUpdateQuery,
      [characterId],
    );
    const depotRow = depot.rows[0];
    const storageRow = storage.rows[0];
    if (!depotRow || !storageRow) throw new Error("storage metadata is missing");
    return {
      depotRevision: depotRow.revision,
      inboxRevision: storageRow.inbox_revision,
      stashRevision: storageRow.stash_revision,
      depotCount: await this.heldItemCount(client, characterId, "depot", depotId),
    };
  }

  async ensureStorageState(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    await client.query(ensureStorageStateInsert, [characterId]);
  }

  async snapshot(
    client: PoolClient,
    characterId: string,
    depotId: number,
  ): Promise<DepotSnapshot> {
    const depot = await client.query<DepotStateRow>(depotRevisionQuery, [
      characterId,
      depotId,
    ]);
    const storage = await client.query<StorageStateRow>(storageStateQuery, [
      characterId,
    ]);
    const depotRow = depot.rows[0];
    const storageRow = storage.rows[0];
    if (!depotRow || !storageRow) throw new Error("storage metadata is missing");
    const stash = await client.query<{ count: string }>(stashTotalCountQuery, [
      characterId,
    ]);
    return {
      depotRevision: depotRow.revision,
      inboxRevision: storageRow.inbox_revision,
      stashRevision: storageRow.stash_revision,
      depotCount: await this.heldItemCount(client, characterId, "depot", depotId),
      inboxCount: await this.heldItemCount(client, characterId, "inbox"),
      stashCount: Number(stash.rows[0]?.count ?? 0),
    };
  }

  async containedCounts(
    client: PoolClient,
    itemIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    if (itemIds.length === 0) return new Map();
    const result = await client.query<{ root_id: string; count: string }>(
      containedCountsQuery,
      [itemIds],
    );
    return new Map(result.rows.map((row) => [row.root_id, Number(row.count)]));
  }

  async heldItemCount(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox",
    depotId?: number,
  ): Promise<number> {
    const result = await client.query<{ count: string }>(
      heldItemCountQuery(location),
      [characterId, depotId ?? null],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async lockItem(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(lockItemQuery, [itemId]);
    return result.rows[0] ?? null;
  }

  async ownershipRoot(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(ownershipRootQuery, [
      itemId,
    ]);
    return result.rows[0] ?? null;
  }

  async lockSubtree(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow[]> {
    const result = await client.query<DepotItemRow>(lockSubtreeQuery, [itemId]);
    if (result.rows.length === 0) throw new Error("item subtree is missing");
    return result.rows;
  }

  async loadCarriedItems(
    client: PoolClient,
    characterId: string,
  ): Promise<DepotItemRow[]> {
    const result = await client.query<DepotItemRow>(carriedItemsQuery, [
      characterId,
    ]);
    if (result.rows.length > 500) throw new Error("character owns too many items");
    return result.rows;
  }

  async lockInventoryDestinations(
    client: PoolClient,
    characterId: string,
    count: number,
  ): Promise<InventoryDestination[]> {
    const equipped = await client.query<{ id: string; item_type_id: number }>(
      equippedBackpackQuery,
      [characterId],
    );
    const backpack = equipped.rows[0];
    if (backpack) {
      const capacity = this.catalog.require(
        backpack.item_type_id,
      ).containerCapacity;
      if (capacity === undefined) {
        throw new Error("equipped backpack is not a container");
      }
      const occupied = await client.query<{ slot_index: number }>(
        containerSlotsForUpdateQuery,
        [backpack.id],
      );
      const slots = new Set(occupied.rows.map((row) => row.slot_index));
      return Array.from({ length: capacity }, (_, slot) => slot)
        .filter((slot) => !slots.has(slot))
        .slice(0, count)
        .map((slot) => ({
          kind: "container" as const,
          containerId: backpack.id,
          slot,
        }));
    }
    const occupied = await client.query<{ slot_index: number }>(
      inventorySlotsForUpdateQuery,
      [characterId],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    return Array.from({ length: 100 }, (_, slot) => slot)
      .filter((slot) => !slots.has(slot))
      .slice(0, count)
      .map((slot) => ({ kind: "inventory" as const, characterId, slot }));
  }

  async firstFreeSlot(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox" | "inventory",
    capacity: number,
    depotId?: number,
  ): Promise<number | null> {
    const result = await client.query<{ slot: number }>(firstFreeSlotQuery, [
      characterId,
      location,
      capacity,
      depotId ?? null,
    ]);
    return result.rows[0]?.slot ?? null;
  }

  weightOf(rows: ReadonlyArray<DepotItemRow>): number {
    return rows.reduce(
      (total, row) =>
        total + this.catalog.require(row.item_type_id).weight * row.count,
      0,
    );
  }

  async auditMerge(
    client: PoolClient,
    characterId: string,
    survivor: Item,
    sourceItemId: string,
    movedCount: number,
    sourceRemaining: number,
    operation: string,
  ): Promise<void> {
    await client.query(mergeAuditInsert, [
      characterId,
      survivor.id,
      sourceItemId,
      movedCount,
      sourceRemaining,
      survivor.count,
      operation,
    ]);
  }

  async auditTransfer(
    client: PoolClient,
    characterId: string,
    before: Item,
    after: Item,
    operation: string,
  ): Promise<void> {
    await client.query(transferAuditInsert, [
      characterId,
      before.id,
      operation,
      JSON.stringify(before.location),
      JSON.stringify(after.location),
    ]);
  }
}
