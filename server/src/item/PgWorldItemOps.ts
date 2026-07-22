import { randomUUID } from "node:crypto";
import type {
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import type { Pool } from "pg";
import { canMergeRows } from "./canMergeRows";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import type { PgWorldItemMaterializer } from "./PgWorldItemMaterializer";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireVersion } from "./requireVersion";
import { samePosition } from "./samePosition";
import { decrementItemCountUpdate } from "./sql/decrementItemCountUpdate";
import { deleteItemById } from "./sql/deleteItemById";
import { dropMergeAllUpdate } from "./sql/dropMergeAllUpdate";
import { dropMergeSourceUpdate } from "./sql/dropMergeSourceUpdate";
import { dropMergeTargetUpdate } from "./sql/dropMergeTargetUpdate";
import { dropToWorldUpdate } from "./sql/dropToWorldUpdate";
import { insertDroppedWorldItem } from "./sql/insertDroppedWorldItem";
import { moveWorldItemQuery } from "./sql/moveWorldItemQuery";
import { moveWorldMergeQuery } from "./sql/moveWorldMergeQuery";
import { moveWorldSeededMergeQuery } from "./sql/moveWorldSeededMergeQuery";
import { pickupMergeIntoContainerUpdate } from "./sql/pickupMergeIntoContainerUpdate";
import { pickupToContainerUpdate } from "./sql/pickupToContainerUpdate";
import { pickupToEquipmentUpdate } from "./sql/pickupToEquipmentUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";
import type { WorldItemSource } from "./WorldItemSource";

export class PgWorldItemOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly mapName: string,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
    private readonly materializer: PgWorldItemMaterializer,
  ) {}

  pickup(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    position: Position,
    source?: WorldItemSource,
    destination?: ItemContainerDestination,
    equipSlot?: EquipmentSlot,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      const character = await this.locks.lockCharacter(client, characterId);
      const row = await this.materializer.lockOrMaterializeWorldItem(
        client,
        itemReference,
        source,
      );
      requireVersion(row, expectedVersion);
      if (
        row.location_type !== "world" ||
        row.world_x === null ||
        row.world_y === null ||
        row.world_z === null ||
        !samePosition(
          { x: row.world_x, y: row.world_y, z: row.world_z },
          position,
        )
      ) {
        throw new Error("world item is stale");
      }
      const type = this.catalog.require(row.item_type_id);
      if (!type.pickupable || !type.movable) throw new Error("item is not pickupable");
      await this.guards.requireCapacity(
        client,
        characterId,
        character.capacity,
        row.id,
      );
      if (equipSlot) {
        if (destination || type.equipmentSlot !== equipSlot) {
          throw new Error("item does not fit equipment slot");
        }
        if (
          type.requirements?.level !== undefined &&
          character.level < type.requirements.level
        ) {
          throw new Error("character level is too low for item");
        }
        if (
          type.requirements?.vocations &&
          !type.requirements.vocations.includes(character.vocation)
        ) {
          throw new Error("character vocation cannot equip item");
        }
        if (
          await this.locks.lockEquipmentSlot(
            client,
            characterId,
            equipSlot,
            row.id,
          )
        ) {
          throw new Error("equipment slot is occupied");
        }
        await this.guards.requireEquipmentCompatibility(
          client,
          characterId,
          row.id,
          equipSlot,
          type.slotType,
        );
        const before = itemFromRow(row);
        const transformedTypeId = type.transformEquipTo ?? row.item_type_id;
        this.catalog.require(transformedTypeId);
        const result = await client.query<ItemRow>(pickupToEquipmentUpdate, [
          row.id,
          transformedTypeId,
          characterId,
          equipSlot,
        ]);
        const after = requireReturnedItem(result.rows[0]);
        await this.audit.transfer(client, characterId, before, after);
        if (transformedTypeId !== row.item_type_id) {
          await this.audit.transform(
            client,
            characterId,
            row.id,
            row.item_type_id,
            transformedTypeId,
          );
        }
        return { before, after: [after] };
      }
      const backpack = destination
        ? await this.locks.lockItem(client, destination.containerId)
        : await this.locks.lockBackpack(client, characterId);
      if (destination) {
        requireVersion(backpack, destination.containerRevision);
        await this.guards.requireOwned(client, backpack.id, characterId);
        const capacity =
          this.catalog.require(backpack.item_type_id).containerCapacity ?? 0;
        if (destination.slot >= capacity) {
          throw new Error("container slot is out of range");
        }
        await this.guards.requireContainerPlacement(
          client,
          row.id,
          backpack.id,
        );
      }
      const before = itemFromRow(row);
      const slotTarget = destination
        ? await this.locks.lockContainerSlot(
            client,
            backpack.id,
            destination.slot,
          )
        : undefined;
      const mergeTarget = type.stackable
        ? destination
          ? canMergeRows(this.catalog, row, slotTarget, row.count)
            ? slotTarget
            : undefined
          : await this.locks.lockContainerMergeTarget(client, backpack.id, row)
        : undefined;
      if (slotTarget && !mergeTarget) {
        throw new Error("container slot is occupied");
      }
      if (mergeTarget) {
        await client.query(deleteItemById, [mergeTarget.id]);
        const result = await client.query<ItemRow>(
          pickupMergeIntoContainerUpdate,
          [row.id, mergeTarget.count, backpack.id, mergeTarget.slot_index],
        );
        const after = requireReturnedItem(result.rows[0]);
        await this.audit.merge(
          client,
          characterId,
          after,
          mergeTarget.id,
          mergeTarget.count,
          0,
        );
        await this.audit.transfer(client, characterId, before, after);
        return {
          before,
          after: [after],
          removedItemIds: [mergeTarget.id],
        };
      }
      const destinationSlot =
        destination?.slot ??
        (await this.locks.firstContainerSlot(client, backpack));
      const result = await client.query<ItemRow>(pickupToContainerUpdate, [
        row.id,
        backpack.id,
        destinationSlot,
      ]);
      const after = requireReturnedItem(result.rows[0]);
      await this.audit.transfer(client, characterId, before, after);
      return { before, after: [after] };
    });
  }

  drop(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    position: Position,
    requestedCount?: number,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.movable) throw new Error("item is not movable");
      const count = requestedCount ?? row.count;
      if (count < 1 || count > row.count || (!type.stackable && count !== 1)) {
        throw new Error("invalid drop count");
      }
      const before = itemFromRow(row);
      const mergeTarget =
        type.stackable && !row.seed_key
          ? await this.locks.lockWorldMergeTarget(client, position, row)
          : undefined;
      if (mergeTarget) {
        if (count === row.count) {
          const mergedResult = await client.query<ItemRow>(
            dropMergeAllUpdate,
            [mergeTarget.id, count],
          );
          await client.query(deleteItemById, [row.id]);
          const merged = requireReturnedItem(mergedResult.rows[0]);
          await this.audit.merge(
            client,
            characterId,
            merged,
            row.id,
            count,
            0,
          );
          return {
            before,
            after: [merged],
            removedItemIds: [row.id],
          };
        }
        const sourceResult = await client.query<ItemRow>(
          dropMergeSourceUpdate,
          [row.id, count],
        );
        const mergedResult = await client.query<ItemRow>(
          dropMergeTargetUpdate,
          [mergeTarget.id, count],
        );
        const sourceAfter = requireReturnedItem(sourceResult.rows[0]);
        const merged = requireReturnedItem(mergedResult.rows[0]);
        await this.audit.merge(
          client,
          characterId,
          merged,
          row.id,
          count,
          sourceAfter.count,
        );
        return { before, after: [sourceAfter, merged] };
      }
      const stackIndex = await this.locks.firstWorldSlot(client, position);
      if (count === row.count) {
        const result = await client.query<ItemRow>(dropToWorldUpdate, [
          row.id,
          this.mapName,
          position.x,
          position.y,
          position.z,
          stackIndex,
        ]);
        const after = requireReturnedItem(result.rows[0]);
        await this.audit.transfer(client, characterId, before, after);
        return { before, after: [after] };
      }
      const sourceResult = await client.query<ItemRow>(
        decrementItemCountUpdate,
        [row.id, count],
      );
      const createdId = randomUUID();
      const createdResult = await client.query<ItemRow>(
        insertDroppedWorldItem,
        [
          createdId,
          row.item_type_id,
          count,
          JSON.stringify(row.attributes),
          this.mapName,
          position.x,
          position.y,
          position.z,
          stackIndex,
        ],
      );
      const sourceAfter = requireReturnedItem(sourceResult.rows[0]);
      const created = requireReturnedItem(createdResult.rows[0]);
      await this.audit.split(client, characterId, before, sourceAfter, created);
      return { before, after: [sourceAfter, created] };
    });
  }

  moveWorldItem(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    fromPosition: Position,
    toPosition: Position,
    source?: WorldItemSource,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      const row = await this.materializer.lockOrMaterializeWorldItem(
        client,
        itemReference,
        source,
      );
      requireVersion(row, expectedVersion);
      if (
        row.location_type !== "world" ||
        row.world_x !== fromPosition.x ||
        row.world_y !== fromPosition.y ||
        row.world_z !== fromPosition.z
      ) {
        throw new Error("item is not at the expected position");
      }
      if (samePosition(fromPosition, toPosition)) {
        throw new Error("item is already on the destination tile");
      }
      const type = this.catalog.require(row.item_type_id);
      if (!type.movable) throw new Error("item is not movable");
      const before = itemFromRow(row);
      const mergeTarget = type.stackable
        ? await this.locks.lockWorldMergeTarget(client, toPosition, row)
        : undefined;
      if (mergeTarget && row.seed_key) {
        await client.query(deleteItemById, [mergeTarget.id]);
        const result = await client.query<ItemRow>(moveWorldSeededMergeQuery, [
          row.id,
          mergeTarget.count,
          toPosition.x,
          toPosition.y,
          toPosition.z,
          mergeTarget.world_stack_index,
          characterId,
          mergeTarget.id,
          JSON.stringify(before.location),
          JSON.stringify(toPosition),
        ]);
        const after = requireReturnedItem(result.rows[0]);
        return { before, after: [after], removedItemIds: [mergeTarget.id] };
      }
      if (mergeTarget) {
        const result = await client.query<ItemRow>(moveWorldMergeQuery, [
          mergeTarget.id,
          row.count,
          row.id,
          characterId,
        ]);
        const merged = requireReturnedItem(result.rows[0]);
        return { before, after: [merged], removedItemIds: [row.id] };
      }
      const stackIndex = await this.locks.firstWorldSlot(client, toPosition);
      const result = await client.query<ItemRow>(moveWorldItemQuery, [
        row.id,
        toPosition.x,
        toPosition.y,
        toPosition.z,
        stackIndex,
        characterId,
        JSON.stringify(before.location),
        JSON.stringify(toPosition),
      ]);
      const after = requireReturnedItem(result.rows[0]);
      return { before, after: [after] };
    });
  }
}
