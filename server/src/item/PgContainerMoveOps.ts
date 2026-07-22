import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canMergeRows } from "./canMergeRows";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { MoveReadState } from "./MoveReadState";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import { requireOwnedInAncestry } from "./requireOwnedInAncestry";
import { requirePlacementInAncestry } from "./requirePlacementInAncestry";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireRow } from "./requireRow";
import { requireVersion } from "./requireVersion";
import { deleteItemById } from "./sql/deleteItemById";
import { moveContainerFullQuery } from "./sql/moveContainerFullQuery";
import { moveContainerMergeFullQuery } from "./sql/moveContainerMergeFullQuery";
import { moveContainerMergePartialQuery } from "./sql/moveContainerMergePartialQuery";
import { moveContainerSeededMergeQuery } from "./sql/moveContainerSeededMergeQuery";
import { moveContainerSplitQuery } from "./sql/moveContainerSplitQuery";
import { moveReadStateQuery } from "./sql/moveReadStateQuery";
import { moveSwapDisplacedToContainerUpdate } from "./sql/moveSwapDisplacedToContainerUpdate";
import { moveSwapDisplaceToStagingUpdate } from "./sql/moveSwapDisplaceToStagingUpdate";
import { moveSwapSourceToContainerUpdate } from "./sql/moveSwapSourceToContainerUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

export class PgContainerMoveOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
  ) {}

  moveToContainer(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    destinationContainerId: string,
    destinationVersion: number,
    destinationSlot: number,
    requestedCount?: number,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      const read = await this.readMoveState(
        client,
        characterId,
        itemId,
        destinationContainerId,
        destinationSlot,
        requestedCount !== undefined,
      );
      if (read.characterCount < 1) throw new Error("character not found");
      const rowsById = new Map(read.items.map((item) => [item.id, item]));
      const row = requireRow(rowsById.get(itemId));
      const destination = requireRow(rowsById.get(destinationContainerId));
      requireVersion(row, expectedVersion);
      requireVersion(destination, destinationVersion);
      requireOwnedInAncestry(read.ancestry, row.id, characterId);
      requireOwnedInAncestry(read.ancestry, destination.id, characterId);
      if (row.location_type !== "container") {
        throw new Error("item cannot move from this location");
      }
      if (row.id === destination.id) {
        throw new Error("an item cannot contain itself");
      }
      const type = this.catalog.require(row.item_type_id);
      const destinationType = this.catalog.require(destination.item_type_id);
      const destinationCapacity = destinationType.containerCapacity ?? 0;
      if (destinationCapacity < 1) {
        throw new Error("destination is not a container");
      }
      if (
        !Number.isInteger(destinationSlot) ||
        destinationSlot < 0 ||
        destinationSlot >= destinationCapacity
      ) {
        throw new Error("container slot is out of range");
      }
      const count = requestedCount ?? row.count;
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > row.count ||
        (!type.stackable && count !== 1)
      ) {
        throw new Error("invalid container move count");
      }
      if (count < row.count && (read.ownedCount ?? 0) >= 500) {
        throw new Error("character has excessive items");
      }
      if (
        row.location_type === "container" &&
        row.container_id === destination.id &&
        row.slot_index === destinationSlot
      ) {
        throw new Error("item is already in destination slot");
      }
      requirePlacementInAncestry(
        read.ancestry,
        row.id,
        destination.id,
        read.itemDepth,
      );
      const before = itemFromRow(row);
      const slotTarget = read.slotTarget ?? undefined;
      const mergeTarget = type.stackable
        ? canMergeRows(this.catalog, row, slotTarget, count)
          ? slotTarget
          : undefined
        : undefined;
      if (slotTarget && !mergeTarget) {
        if (count !== row.count) {
          throw new Error("cannot split into an occupied slot");
        }
        if (row.slot_index === null) {
          throw new Error("item source slot is missing");
        }
        await this.guards.requireContainerPlacement(
          client,
          slotTarget.id,
          row.container_id ?? "",
        );
        const displacedBefore = itemFromRow(slotTarget);
        const temporarySlot = await this.locks.firstStagingSlot(
          client,
          characterId,
        );
        await client.query(moveSwapDisplaceToStagingUpdate, [
          slotTarget.id,
          characterId,
          temporarySlot,
        ]);
        const sourceResult = await client.query<ItemRow>(
          moveSwapSourceToContainerUpdate,
          [row.id, destination.id, destinationSlot],
        );
        const displacedResult = await client.query<ItemRow>(
          moveSwapDisplacedToContainerUpdate,
          [slotTarget.id, row.container_id, row.slot_index],
        );
        const after = requireReturnedItem(sourceResult.rows[0]);
        const displaced = requireReturnedItem(displacedResult.rows[0]);
        await this.audit.transfer(client, characterId, before, after);
        await this.audit.transfer(
          client,
          characterId,
          displacedBefore,
          displaced,
        );
        return { before, after: [after, displaced] };
      }
      if (mergeTarget) {
        if (count === row.count && row.seed_key) {
          await client.query(deleteItemById, [mergeTarget.id]);
          const result = await client.query<ItemRow>(
            moveContainerSeededMergeQuery,
            [
              row.id,
              mergeTarget.count,
              destination.id,
              mergeTarget.slot_index,
              characterId,
              mergeTarget.id,
              JSON.stringify(before.location),
            ],
          );
          const after = requireReturnedItem(result.rows[0]);
          return {
            before,
            after: [after],
            removedItemIds: [mergeTarget.id],
          };
        }
        if (count === row.count) {
          const result = await client.query<ItemRow>(
            moveContainerMergeFullQuery,
            [mergeTarget.id, count, row.id, characterId],
          );
          const merged = requireReturnedItem(result.rows[0]);
          return {
            before,
            after: [merged],
            removedItemIds: [row.id],
          };
        }
        const result = await client.query<{
          merged: ItemRow | null;
          source: ItemRow | null;
        }>(moveContainerMergePartialQuery, [
          mergeTarget.id,
          count,
          row.id,
          characterId,
        ]);
        const merged = requireReturnedItem(result.rows[0]?.merged ?? undefined);
        const sourceAfter = requireReturnedItem(
          result.rows[0]?.source ?? undefined,
        );
        return { before, after: [sourceAfter, merged] };
      }
      if (count === row.count) {
        const result = await client.query<ItemRow>(moveContainerFullQuery, [
          row.id,
          destination.id,
          destinationSlot,
          characterId,
          JSON.stringify(before.location),
        ]);
        const after = requireReturnedItem(result.rows[0]);
        return { before, after: [after] };
      }
      const result = await client.query<{
        source: ItemRow | null;
        created: ItemRow | null;
      }>(moveContainerSplitQuery, [
        row.id,
        count,
        randomUUID(),
        row.item_type_id,
        JSON.stringify(row.attributes),
        destination.id,
        destinationSlot,
        characterId,
        before.count,
      ]);
      const sourceAfter = requireReturnedItem(
        result.rows[0]?.source ?? undefined,
      );
      const created = requireReturnedItem(
        result.rows[0]?.created ?? undefined,
      );
      return { before, after: [sourceAfter, created] };
    });
  }

  /**
   * Gathers every lock and precondition for moveToContainer in one
   * round-trip: locks the character, both item rows, and the destination
   * slot occupant, and reads the ownership/nesting ancestry needed for
   * validation. Lock order (character, items sorted by id, slot occupant)
   * is enforced by chaining the materialized CTEs.
   */
  private async readMoveState(
    client: PoolClient,
    characterId: string,
    itemId: string,
    destinationContainerId: string,
    destinationSlot: number,
    needOwnedCount: boolean,
  ): Promise<MoveReadState> {
    const result = await client.query<{
      character_count: number;
      items: ItemRow[];
      slot_target: ItemRow | null;
      ancestry: Array<{
        originId: string;
        id: string;
        characterId: string | null;
        locationType: string;
        depth: number;
      }>;
      item_depth: number | null;
      owned_count: number | null;
    }>(moveReadStateQuery, [
      characterId,
      [...new Set([itemId, destinationContainerId])].sort(),
      destinationContainerId,
      destinationSlot,
      itemId,
      needOwnedCount,
    ]);
    const read = result.rows[0];
    if (!read) throw new Error("item move state query returned no row");
    return {
      characterCount: read.character_count,
      items: read.items,
      slotTarget: read.slot_target,
      ancestry: read.ancestry,
      itemDepth: read.item_depth,
      ownedCount: read.owned_count,
    };
  }
}
