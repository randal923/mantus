import { randomUUID } from "node:crypto";
import type {
  CharacterVocation,
  EquipmentSlot,
  ItemContainerDestination,
  Position,
} from "@tibia/protocol";
import { Pool, type PoolClient } from "pg";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import type { Item } from "./Item";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemLocation } from "./ItemLocation";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";
import type { LootItemCreation } from "./LootItemCreation";
import type { WorldItemDeltas } from "./WorldItemDeltas";
import type {
  WorldItemSource,
  WorldItemSourceContent,
} from "./WorldItemSource";

interface ItemRow {
  id: string;
  item_type_id: number;
  count: number;
  attributes: unknown;
  version: number;
  location_type: ItemLocation["kind"];
  character_id: string | null;
  container_id: string | null;
  slot_index: number | null;
  equipment_slot: EquipmentSlot | null;
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  world_stack_index: number | null;
  seed_key: string | null;
}

interface CharacterItemRow {
  level: number;
  vocation: CharacterVocation;
  progression_definition_version: number;
  capacity: number;
  version: number;
  mana: number;
  soul: number;
}

const ITEM_COLUMNS = `
  id, item_type_id, count, attributes, version, location_type,
  character_id, container_id, slot_index, equipment_slot,
  world_x, world_y, world_z, world_stack_index, seed_key`;

const OWNED_ITEMS_QUERY = `
  WITH RECURSIVE owned AS (
    SELECT i.*, 1 AS item_depth
    FROM items i
    WHERE i.character_id = $1
      AND i.location_type IN ('equipment', 'inventory')
    UNION ALL
    SELECT child.*, owned.item_depth + 1
    FROM items child
    JOIN owned ON child.container_id = owned.id
    WHERE child.location_type IN ('container', 'corpse')
      AND owned.item_depth < 8
  )
  SELECT ${ITEM_COLUMNS}
  FROM owned
  ORDER BY item_depth, location_type, equipment_slot, slot_index
  LIMIT 501`;

function isAttributes(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function locationFromRow(row: ItemRow): ItemLocation {
  if (
    row.location_type === "equipment" &&
    row.character_id &&
    row.equipment_slot
  ) {
    return {
      kind: "equipment",
      characterId: row.character_id,
      slot: row.equipment_slot,
    };
  }
  if (
    [
      "inventory",
      "depot",
      "inbox",
      "trade-reservation",
      "market-escrow",
    ].includes(row.location_type) &&
    row.character_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type as
        | "inventory"
        | "depot"
        | "inbox"
        | "trade-reservation"
        | "market-escrow",
      characterId: row.character_id,
      slot: row.slot_index,
    };
  }
  if (
    (row.location_type === "container" || row.location_type === "corpse") &&
    row.container_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type,
      containerId: row.container_id,
      slot: row.slot_index,
    };
  }
  if (
    (row.location_type === "world" || row.location_type === "house") &&
    row.world_x !== null &&
    row.world_y !== null &&
    row.world_z !== null &&
    row.world_stack_index !== null
  ) {
    return {
      kind: row.location_type,
      position: { x: row.world_x, y: row.world_y, z: row.world_z },
      stackIndex: row.world_stack_index,
    };
  }
  throw new Error(`item ${row.id} has an invalid persisted location`);
}

function itemFromRow(row: ItemRow): Item {
  if (!isAttributes(row.attributes)) {
    throw new Error(`item ${row.id} has invalid attributes`);
  }
  return {
    id: row.id,
    typeId: row.item_type_id,
    count: row.count,
    attributes: row.attributes,
    version: row.version,
    location: locationFromRow(row),
    ...(row.seed_key ? { seedKey: row.seed_key } : {}),
  };
}

function samePosition(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export class PgItemStore implements ItemStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly mapName: string,
  ) {}

  async loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>> {
    const result = await this.pool.query<ItemRow>(OWNED_ITEMS_QUERY, [characterId]);
    if (result.rows.length > 500) {
      throw new Error(`character ${characterId} has excessive nested items`);
    }
    return result.rows.map(itemFromRow);
  }

  equip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      const character = await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      if (
        row.location_type !== "inventory" &&
        row.location_type !== "container"
      ) {
        throw new Error("item cannot be equipped from this location");
      }
      const type = this.catalog.require(row.item_type_id);
      if (type.equipmentSlot !== slot) throw new Error("item does not fit slot");
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
      const before = itemFromRow(row);
      const transformedTypeId = type.transformEquipTo ?? row.item_type_id;
      this.catalog.require(transformedTypeId);
      const occupied = await this.lockEquipmentSlot(
        client,
        characterId,
        slot,
        row.id,
      );
      let displacedBefore: Item | undefined;
      let displacedTypeId: number | undefined;
      if (occupied) {
        if (row.slot_index === null) throw new Error("item source slot is missing");
        if (row.location_type === "container") {
          await this.requireContainerPlacement(
            client,
            occupied.id,
            row.container_id ?? "",
          );
        }
        displacedBefore = itemFromRow(occupied);
        const occupiedType = this.catalog.require(occupied.item_type_id);
        displacedTypeId =
          occupiedType.transformDeEquipTo ?? occupied.item_type_id;
        this.catalog.require(displacedTypeId);
        const temporarySlot = await this.firstInventorySlot(client, characterId);
        await client.query(
          `UPDATE items
           SET item_type_id = $2, location_type = 'inventory',
               character_id = $3, equipment_slot = null,
               container_id = null, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1`,
          [occupied.id, displacedTypeId, characterId, temporarySlot],
        );
      }
      await this.requireEquipmentCompatibility(
        client,
        characterId,
        row.id,
        slot,
        type.slotType,
      );
      const updated = await client.query<ItemRow>(
        `UPDATE items
         SET item_type_id = $3, location_type = 'equipment',
             character_id = $1, equipment_slot = $4,
             container_id = null, slot_index = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $2
         RETURNING ${ITEM_COLUMNS}`,
        [characterId, row.id, transformedTypeId, slot],
      );
      const after = this.requireReturnedItem(updated.rows[0]);
      let displaced: Item | undefined;
      if (occupied && displacedTypeId !== undefined) {
        const displacedResult =
          row.location_type === "inventory"
            ? await client.query<ItemRow>(
                `UPDATE items
                 SET location_type = 'inventory', character_id = $2,
                     equipment_slot = null, container_id = null,
                     slot_index = $3, updated_at = now()
                 WHERE id = $1
                 RETURNING ${ITEM_COLUMNS}`,
                [occupied.id, characterId, row.slot_index],
              )
            : await client.query<ItemRow>(
                `UPDATE items
                 SET location_type = 'container', character_id = null,
                     equipment_slot = null, container_id = $2,
                     slot_index = $3, updated_at = now()
                 WHERE id = $1
                 RETURNING ${ITEM_COLUMNS}`,
                [occupied.id, row.container_id, row.slot_index],
              );
        displaced = this.requireReturnedItem(displacedResult.rows[0]);
      }
      await this.auditTransfer(client, characterId, before, after);
      if (displacedBefore && displaced) {
        await this.auditTransfer(
          client,
          characterId,
          displacedBefore,
          displaced,
        );
      }
      if (transformedTypeId !== row.item_type_id) {
        await this.auditTransform(
          client,
          characterId,
          row.id,
          row.item_type_id,
          transformedTypeId,
        );
      }
      if (
        occupied &&
        displacedTypeId !== undefined &&
        displacedTypeId !== occupied.item_type_id
      ) {
        await this.auditTransform(
          client,
          characterId,
          occupied.id,
          occupied.item_type_id,
          displacedTypeId,
        );
      }
      return { before, after: displaced ? [after, displaced] : [after] };
    });
  }

  unequip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      if (
        row.location_type !== "equipment" ||
        row.character_id !== characterId ||
        row.equipment_slot !== slot
      ) {
        throw new Error("item is not equipped in that slot");
      }
      const before = itemFromRow(row);
      const type = this.catalog.require(row.item_type_id);
      const transformedTypeId = type.transformDeEquipTo ?? row.item_type_id;
      this.catalog.require(transformedTypeId);
      let updated: ItemRow;
      if (destination) {
        const container = await this.lockItem(client, destination.containerId);
        this.requireVersion(container, destination.containerRevision);
        await this.requireOwned(client, container.id, characterId);
        const capacity =
          this.catalog.require(container.item_type_id).containerCapacity ?? 0;
        if (destination.slot >= capacity) {
          throw new Error("container slot is out of range");
        }
        await this.requireContainerPlacement(client, row.id, container.id);
        if (await this.lockContainerSlot(client, container.id, destination.slot)) {
          throw new Error("container slot is occupied");
        }
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET item_type_id = $2, location_type = 'container',
               character_id = null, equipment_slot = null,
               container_id = $3, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, transformedTypeId, container.id, destination.slot],
        );
        updated = this.requireRow(result.rows[0]);
      } else if (slot === "backpack") {
        const destinationSlot = await this.firstInventorySlot(client, characterId);
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET item_type_id = $3, location_type = 'inventory',
               character_id = $1, equipment_slot = null,
               container_id = null, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $2
           RETURNING ${ITEM_COLUMNS}`,
          [characterId, row.id, transformedTypeId, destinationSlot],
        );
        updated = this.requireRow(result.rows[0]);
      } else {
        const backpack = await this.lockBackpack(client, characterId);
        const destinationSlot = await this.firstContainerSlot(client, backpack);
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET item_type_id = $2, location_type = 'container',
               character_id = null, equipment_slot = null,
               container_id = $3, slot_index = $4,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, transformedTypeId, backpack.id, destinationSlot],
        );
        updated = this.requireRow(result.rows[0]);
      }
      const after = itemFromRow(updated);
      await this.auditTransfer(client, characterId, before, after);
      if (transformedTypeId !== row.item_type_id) {
        await this.auditTransform(
          client,
          characterId,
          row.id,
          row.item_type_id,
          transformedTypeId,
        );
      }
      return { before, after: [after] };
    });
  }

  pickup(
    characterId: string,
    itemReference: string,
    expectedVersion: number,
    position: Position,
    source?: WorldItemSource,
    destination?: ItemContainerDestination,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      const character = await this.lockCharacter(client, characterId);
      const row = await this.lockOrMaterializeWorldItem(
        client,
        itemReference,
        source,
      );
      this.requireVersion(row, expectedVersion);
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
      await this.requireCapacity(
        client,
        characterId,
        character.capacity,
        row.id,
      );
      const backpack = destination
        ? await this.lockItem(client, destination.containerId)
        : await this.lockBackpack(client, characterId);
      if (destination) {
        this.requireVersion(backpack, destination.containerRevision);
        await this.requireOwned(client, backpack.id, characterId);
        const capacity =
          this.catalog.require(backpack.item_type_id).containerCapacity ?? 0;
        if (destination.slot >= capacity) {
          throw new Error("container slot is out of range");
        }
        await this.requireContainerPlacement(client, row.id, backpack.id);
      }
      const before = itemFromRow(row);
      const slotTarget = destination
        ? await this.lockContainerSlot(client, backpack.id, destination.slot)
        : undefined;
      const mergeTarget = type.stackable
        ? destination
          ? this.canMergeRows(row, slotTarget, row.count)
            ? slotTarget
            : undefined
          : await this.lockContainerMergeTarget(client, backpack.id, row)
        : undefined;
      if (slotTarget && !mergeTarget) {
        throw new Error("container slot is occupied");
      }
      if (mergeTarget) {
        await client.query("DELETE FROM items WHERE id = $1", [mergeTarget.id]);
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET count = count + $2, location_type = 'container',
               container_id = $3, slot_index = $4,
               character_id = null, equipment_slot = null,
               world_map_name = null, world_x = null, world_y = null,
               world_z = null, world_stack_index = null,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, mergeTarget.count, backpack.id, mergeTarget.slot_index],
        );
        const after = this.requireReturnedItem(result.rows[0]);
        await this.auditMerge(
          client,
          characterId,
          after,
          mergeTarget.id,
          mergeTarget.count,
          0,
        );
        await this.auditTransfer(client, characterId, before, after);
        return {
          before,
          after: [after],
          removedItemIds: [mergeTarget.id],
        };
      }
      const destinationSlot =
        destination?.slot ?? (await this.firstContainerSlot(client, backpack));
      const result = await client.query<ItemRow>(
        `UPDATE items
         SET location_type = 'container', container_id = $2, slot_index = $3,
             character_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, backpack.id, destinationSlot],
      );
      const after = this.requireReturnedItem(result.rows[0]);
      await this.auditTransfer(client, characterId, before, after);
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
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.movable) throw new Error("item is not movable");
      const count = requestedCount ?? row.count;
      if (count < 1 || count > row.count || (!type.stackable && count !== 1)) {
        throw new Error("invalid drop count");
      }
      const before = itemFromRow(row);
      const mergeTarget =
        type.stackable && !row.seed_key
          ? await this.lockWorldMergeTarget(client, position, row)
          : undefined;
      if (mergeTarget) {
        if (count === row.count) {
          const mergedResult = await client.query<ItemRow>(
            `UPDATE items
             SET count = count + $2, version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${ITEM_COLUMNS}`,
            [mergeTarget.id, count],
          );
          await client.query("DELETE FROM items WHERE id = $1", [row.id]);
          const merged = this.requireReturnedItem(mergedResult.rows[0]);
          await this.auditMerge(
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
          `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, count],
        );
        const mergedResult = await client.query<ItemRow>(
          `UPDATE items
           SET count = count + $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [mergeTarget.id, count],
        );
        const sourceAfter = this.requireReturnedItem(sourceResult.rows[0]);
        const merged = this.requireReturnedItem(mergedResult.rows[0]);
        await this.auditMerge(
          client,
          characterId,
          merged,
          row.id,
          count,
          sourceAfter.count,
        );
        return { before, after: [sourceAfter, merged] };
      }
      const stackIndex = await this.firstWorldSlot(client, position);
      if (count === row.count) {
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET location_type = 'world', world_map_name = $2,
               world_x = $3, world_y = $4, world_z = $5,
               world_stack_index = $6, character_id = null,
               container_id = null, slot_index = null, equipment_slot = null,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, this.mapName, position.x, position.y, position.z, stackIndex],
        );
        const after = this.requireReturnedItem(result.rows[0]);
        await this.auditTransfer(client, characterId, before, after);
        return { before, after: [after] };
      }
      const sourceResult = await client.query<ItemRow>(
        `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, count],
      );
      const createdId = randomUUID();
      const createdResult = await client.query<ItemRow>(
        `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           world_map_name, world_x, world_y, world_z, world_stack_index
         ) VALUES ($1, $2, $3, $4::jsonb, 'world', $5, $6, $7, $8, $9)
         RETURNING ${ITEM_COLUMNS}`,
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
      const sourceAfter = this.requireReturnedItem(sourceResult.rows[0]);
      const created = this.requireReturnedItem(createdResult.rows[0]);
      await this.auditSplit(client, characterId, before, sourceAfter, created);
      return { before, after: [sourceAfter, created] };
    });
  }

  split(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.stackable || count < 1 || count >= row.count) {
        throw new Error("invalid stack split");
      }
      await this.requireOwnedItemSpace(client, characterId);
      if (
        row.location_type !== "container" &&
        row.location_type !== "inventory"
      ) {
        throw new Error("stack cannot be split in this location");
      }
      const before = itemFromRow(row);
      let destinationSlot: number;
      if (row.location_type === "container") {
        const container = await this.lockItem(client, row.container_id ?? "");
        destinationSlot = await this.firstContainerSlot(client, container);
      } else {
        destinationSlot = await this.firstInventorySlot(client, characterId);
      }
      const sourceResult = await client.query<ItemRow>(
        `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, count],
      );
      const createdId = randomUUID();
      const createdResult = await client.query<ItemRow>(
        `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, container_id, slot_index
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         RETURNING ${ITEM_COLUMNS}`,
        [
          createdId,
          row.item_type_id,
          count,
          JSON.stringify(row.attributes),
          row.location_type,
          row.location_type === "inventory" ? characterId : null,
          row.location_type === "container" ? row.container_id : null,
          destinationSlot,
        ],
      );
      const sourceAfter = this.requireReturnedItem(sourceResult.rows[0]);
      const created = this.requireReturnedItem(createdResult.rows[0]);
      await this.auditSplit(client, characterId, before, sourceAfter, created);
      return { before, after: [sourceAfter, created] };
    });
  }

  rotate(
    characterId: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      const before = itemFromRow(row);
      const targetId = this.catalog.require(row.item_type_id).rotateTo;
      if (!targetId) throw new Error("item cannot be rotated");
      this.catalog.require(targetId);
      const result = await client.query<ItemRow>(
        `UPDATE items
         SET item_type_id = $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, targetId],
      );
      const after = this.requireReturnedItem(result.rows[0]);
      await this.auditTransform(
        client,
        characterId,
        row.id,
        row.item_type_id,
        targetId,
      );
      return { before, after: [after] };
    });
  }

  moveToContainer(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    destinationContainerId: string,
    destinationVersion: number,
    destinationSlot: number,
    requestedCount?: number,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const locked = await this.lockItems(
        client,
        [itemId, destinationContainerId],
      );
      const row = this.requireRow(locked.get(itemId));
      const destination = this.requireRow(locked.get(destinationContainerId));
      this.requireVersion(row, expectedVersion);
      this.requireVersion(destination, destinationVersion);
      await this.requireOwned(client, row.id, characterId);
      await this.requireOwned(client, destination.id, characterId);
      if (
        row.location_type !== "inventory" &&
        row.location_type !== "container"
      ) {
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
      if (count < row.count) {
        await this.requireOwnedItemSpace(client, characterId);
      }
      if (
        row.location_type === "container" &&
        row.container_id === destination.id &&
        row.slot_index === destinationSlot
      ) {
        throw new Error("item is already in destination slot");
      }
      await this.requireContainerPlacement(client, row.id, destination.id);
      const before = itemFromRow(row);
      const slotTarget = await this.lockContainerSlot(
        client,
        destination.id,
        destinationSlot,
      );
      const mergeTarget = type.stackable
        ? this.canMergeRows(row, slotTarget, count)
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
        if (row.location_type === "container") {
          await this.requireContainerPlacement(
            client,
            slotTarget.id,
            row.container_id ?? "",
          );
        }
        const displacedBefore = itemFromRow(slotTarget);
        const temporarySlot = await this.firstInventorySlot(client, characterId);
        await client.query(
          `UPDATE items
           SET location_type = 'inventory', character_id = $2,
               container_id = null, slot_index = $3,
               equipment_slot = null, version = version + 1,
               updated_at = now()
           WHERE id = $1`,
          [slotTarget.id, characterId, temporarySlot],
        );
        const sourceResult = await client.query<ItemRow>(
          `UPDATE items
           SET location_type = 'container', character_id = null,
               equipment_slot = null, container_id = $2, slot_index = $3,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, destination.id, destinationSlot],
        );
        const displacedResult =
          row.location_type === "inventory"
            ? await client.query<ItemRow>(
                `UPDATE items
                 SET location_type = 'inventory', character_id = $2,
                     container_id = null, slot_index = $3,
                     equipment_slot = null, updated_at = now()
                 WHERE id = $1
                 RETURNING ${ITEM_COLUMNS}`,
                [slotTarget.id, characterId, row.slot_index],
              )
            : await client.query<ItemRow>(
                `UPDATE items
                 SET location_type = 'container', character_id = null,
                     container_id = $2, slot_index = $3,
                     equipment_slot = null, updated_at = now()
                 WHERE id = $1
                 RETURNING ${ITEM_COLUMNS}`,
                [slotTarget.id, row.container_id, row.slot_index],
              );
        const after = this.requireReturnedItem(sourceResult.rows[0]);
        const displaced = this.requireReturnedItem(displacedResult.rows[0]);
        await this.auditTransfer(client, characterId, before, after);
        await this.auditTransfer(
          client,
          characterId,
          displacedBefore,
          displaced,
        );
        return { before, after: [after, displaced] };
      }
      if (mergeTarget) {
        if (count === row.count && row.seed_key) {
          await client.query("DELETE FROM items WHERE id = $1", [
            mergeTarget.id,
          ]);
          const result = await client.query<ItemRow>(
            `UPDATE items
             SET count = count + $2, location_type = 'container',
                 character_id = null, equipment_slot = null,
                 container_id = $3, slot_index = $4,
                 version = version + 1, updated_at = now()
             WHERE id = $1
             RETURNING ${ITEM_COLUMNS}`,
            [
              row.id,
              mergeTarget.count,
              destination.id,
              mergeTarget.slot_index,
            ],
          );
          const after = this.requireReturnedItem(result.rows[0]);
          await this.auditMerge(
            client,
            characterId,
            after,
            mergeTarget.id,
            mergeTarget.count,
            0,
          );
          await this.auditTransfer(client, characterId, before, after);
          return {
            before,
            after: [after],
            removedItemIds: [mergeTarget.id],
          };
        }
        const mergedResult = await client.query<ItemRow>(
          `UPDATE items
           SET count = count + $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [mergeTarget.id, count],
        );
        const merged = this.requireReturnedItem(mergedResult.rows[0]);
        if (count === row.count) {
          await client.query("DELETE FROM items WHERE id = $1", [row.id]);
          await this.auditMerge(
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
          `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, count],
        );
        const sourceAfter = this.requireReturnedItem(sourceResult.rows[0]);
        await this.auditMerge(
          client,
          characterId,
          merged,
          row.id,
          count,
          sourceAfter.count,
        );
        return { before, after: [sourceAfter, merged] };
      }
      if (count === row.count) {
        const result = await client.query<ItemRow>(
          `UPDATE items
           SET location_type = 'container', character_id = null,
               equipment_slot = null, container_id = $2, slot_index = $3,
               version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, destination.id, destinationSlot],
        );
        const after = this.requireReturnedItem(result.rows[0]);
        await this.auditTransfer(client, characterId, before, after);
        return { before, after: [after] };
      }
      const sourceResult = await client.query<ItemRow>(
        `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, count],
      );
      const createdResult = await client.query<ItemRow>(
        `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           container_id, slot_index
         ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)
         RETURNING ${ITEM_COLUMNS}`,
        [
          randomUUID(),
          row.item_type_id,
          count,
          JSON.stringify(row.attributes),
          destination.id,
          destinationSlot,
        ],
      );
      const sourceAfter = this.requireReturnedItem(sourceResult.rows[0]);
      const created = this.requireReturnedItem(createdResult.rows[0]);
      await this.auditSplit(client, characterId, before, sourceAfter, created);
      return { before, after: [sourceAfter, created] };
    });
  }

  writeText(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    text: string,
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.text?.writeable) throw new Error("item is not writeable");
      const before = itemFromRow(row);
      if (
        text.length > type.text.maxLength ||
        Buffer.byteLength(JSON.stringify({ ...before.attributes, text })) > 4_096
      ) {
        throw new Error("item text is too long");
      }
      const result = await client.query<ItemRow>(
        `UPDATE items
         SET attributes = jsonb_set(
               attributes, '{text}', to_jsonb($2::text), true
             ),
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, text],
      );
      const after = this.requireReturnedItem(result.rows[0]);
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-written', $1, $2,
           jsonb_build_object(
             'previousLength', $3::integer, 'length', $4::integer
           )
         )`,
        [
          characterId,
          row.id,
          typeof before.attributes.text === "string"
            ? before.attributes.text.length
            : 0,
          text.length,
        ],
      );
      return { before, after: [after] };
    });
  }

  consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    reason: "rune" | "ammunition" | "break" | "food",
  ): Promise<ItemMutation> {
    return this.transaction(async (client) => {
      await this.lockCharacter(client, characterId);
      const row = await this.lockItem(client, itemId);
      this.requireVersion(row, expectedVersion);
      await this.requireOwned(client, row.id, characterId);
      if (!Number.isInteger(count) || count < 1 || count > row.count) {
        throw new Error("invalid consume count");
      }
      const before = itemFromRow(row);
      if (count === row.count) {
        await client.query(`DELETE FROM items WHERE id = $1`, [row.id]);
        await this.auditDestruction(
          client,
          characterId,
          before,
          count,
          reason,
        );
        return { before, after: [], removedItemIds: [row.id] };
      }
      const result = await client.query<ItemRow>(
        `UPDATE items
         SET count = count - $2, version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, count],
      );
      const after = this.requireReturnedItem(result.rows[0]);
      await this.auditDestruction(
        client,
        characterId,
        before,
        count,
        reason,
      );
      return { before, after: [after] };
    });
  }

  conjure(
    characterId: string,
    expectedCharacterVersion: number,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
    sourceItemTypeId: number,
    targetItemTypeId: number,
    count: number,
  ): Promise<ConjureItemResult> {
    return this.transaction(async (client) => {
      const character = await this.lockCharacter(client, characterId);
      if (
        character.version !== expectedCharacterVersion ||
        character.mana !== expectedMana ||
        character.soul !== expectedSoul ||
        !Number.isInteger(manaCost) ||
        manaCost < 0 ||
        character.mana < manaCost ||
        !Number.isInteger(soulCost) ||
        soulCost < 0 ||
        character.soul < soulCost
      ) {
        throw new Error("character resources are stale");
      }
      const targetType = this.catalog.require(targetItemTypeId);
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > targetType.maxCount
      ) {
        throw new Error("conjured item count is out of range");
      }
      const source =
        sourceItemTypeId === 0
          ? undefined
          : await this.lockOwnedItemByType(
              client,
              characterId,
              sourceItemTypeId,
            );
      if (sourceItemTypeId !== 0 && !source) {
        throw new Error("conjure source item is missing");
      }
      const currentItems = await client.query<ItemRow>(OWNED_ITEMS_QUERY, [
        characterId,
      ]);
      if (currentItems.rows.length > 500) {
        throw new Error("character has excessive items");
      }
      const currentWeight = currentItems.rows.reduce(
        (total, item) =>
          total + this.catalog.require(item.item_type_id).weight * item.count,
        0,
      );
      const sourceWeight = source
        ? this.catalog.require(source.item_type_id).weight
        : 0;
      const resultWeight =
        targetType.weight * count;
      if (
        currentWeight - sourceWeight + resultWeight >
        character.capacity * 100
      ) {
        throw new Error("character capacity exceeded");
      }

      const characterResult = await client.query<{ version: number }>(
        `UPDATE characters
         SET mana = mana - $3, soul = soul - $4,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2
           AND mana = $5 AND soul = $6
         RETURNING version`,
        [
          characterId,
          expectedCharacterVersion,
          manaCost,
          soulCost,
          expectedMana,
          expectedSoul,
        ],
      );
      const characterVersion = characterResult.rows[0]?.version;
      if (characterVersion !== expectedCharacterVersion + 1) {
        throw new Error("character resources changed during conjuring");
      }

      const before = source ? itemFromRow(source) : undefined;
      if (source?.count === 1) {
        const transformed = await client.query<ItemRow>(
          `UPDATE items
           SET item_type_id = $2, count = $3, attributes = '{}'::jsonb,
               version = version + 1, seed_key = null,
               seed_map_name = null, seed_map_version = null,
               seed_x = null, seed_y = null, seed_z = null,
               seed_stack_index = null, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [source.id, targetItemTypeId, count],
        );
        const after = this.requireReturnedItem(transformed.rows[0]);
        await this.auditDestruction(
          client,
          characterId,
          before!,
          1,
          "conjure-source",
        );
        await this.auditCreation(
          client,
          characterId,
          after,
          "conjuring",
        );
        return {
          mutation: { before, after: [after] },
          characterVersion,
        };
      }

      const after: Item[] = [];
      if (source) {
        const remaining = await client.query<ItemRow>(
          `UPDATE items
           SET count = count - 1, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [source.id],
        );
        after.push(this.requireReturnedItem(remaining.rows[0]));
        await this.auditDestruction(
          client,
          characterId,
          before!,
          1,
          "conjure-source",
        );
      }
      await this.requireOwnedItemSpace(client, characterId);
      const backpack = await this.lockBackpack(client, characterId);
      const slot = await this.firstContainerSlot(client, backpack);
      const itemId = randomUUID();
      const inserted = await client.query<ItemRow>(
        `INSERT INTO items(
           id, item_type_id, count, attributes, version,
           location_type, container_id, slot_index
         )
         VALUES ($1, $2, $3, '{}'::jsonb, 1, 'container', $4, $5)
         RETURNING ${ITEM_COLUMNS}`,
        [itemId, targetItemTypeId, count, backpack.id, slot],
      );
      const created = this.requireReturnedItem(inserted.rows[0]);
      after.push(created);
      await this.auditCreation(
        client,
        characterId,
        created,
        "conjuring",
      );
      return {
        mutation: { ...(before ? { before } : {}), after },
        characterVersion,
      };
    });
  }

  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): Promise<ReadonlyArray<Item>> {
    return this.transaction(async (client) => {
      if (!/^[A-Za-z0-9:_-]{1,128}$/.test(eventId)) {
        throw new Error("loot event id is invalid");
      }
      if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex > 255) {
        throw new Error("corpse stack index is invalid");
      }
      const corpseType = this.catalog.require(corpseTypeId);
      const capacity = corpseType.containerCapacity ?? 0;
      if (capacity < loot.length) {
        throw new Error("corpse cannot contain rolled loot");
      }
      for (const entry of loot) {
        const type = this.catalog.require(entry.typeId);
        if (
          !Number.isInteger(entry.count) ||
          entry.count < 1 ||
          entry.count > type.maxCount
        ) {
          throw new Error("loot count is invalid");
        }
      }
      const corpseId = randomUUID();
      const corpseResult = await client.query<ItemRow>(
        `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           world_map_name, world_x, world_y, world_z, world_stack_index
         ) VALUES ($1, $2, 1, '{}'::jsonb, 'world', $3, $4, $5, $6, $7)
         RETURNING ${ITEM_COLUMNS}`,
        [
          corpseId,
          corpseTypeId,
          this.mapName,
          position.x,
          position.y,
          position.z,
          stackIndex,
        ],
      );
      const created = [this.requireReturnedItem(corpseResult.rows[0])];
      for (let slot = 0; slot < loot.length; slot++) {
        const entry = loot[slot];
        if (!entry) continue;
        const result = await client.query<ItemRow>(
          `INSERT INTO items (
             id, item_type_id, count, attributes, location_type,
             container_id, slot_index
           ) VALUES ($1, $2, $3, '{}'::jsonb, 'corpse', $4, $5)
           RETURNING ${ITEM_COLUMNS}`,
          [randomUUID(), entry.typeId, entry.count, corpseId, slot],
        );
        created.push(this.requireReturnedItem(result.rows[0]));
      }
      for (const item of created) {
        await client.query(
          `INSERT INTO audit_log(event_type, character_id, item_id, details)
           VALUES (
             'item-created', $1, $2,
             jsonb_build_object(
               'eventId', $3::text, 'itemTypeId', $4::integer,
               'count', $5::integer, 'reason', 'monster-loot'
             )
           )`,
          [characterId, item.id, eventId, item.typeId, item.count],
        );
      }
      return created;
    });
  }

  async loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas> {
    const incompatible = await this.pool.query(
      `SELECT 1 FROM items
       WHERE seed_map_name = $1 AND seed_map_version <> $2
       LIMIT 1`,
      [mapName, mapVersion],
    );
    if (incompatible.rowCount) {
      throw new Error(
        "persisted world items require reconciliation for this map version",
      );
    }
    const changed = await this.pool.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE seed_map_name = $1 AND seed_map_version = $2 AND version > 1`,
      [mapName, mapVersion],
    );
    const dropped = await this.pool.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE seed_key IS NULL AND location_type = 'world'
         AND world_map_name = $1`,
      [mapName],
    );
    return {
      hiddenSeedKeys: changed.rows.flatMap((row) =>
        row.seed_key ? [row.seed_key] : [],
      ),
      items: [...changed.rows, ...dropped.rows]
        .filter((row) => row.location_type === "world")
        .map(itemFromRow),
    };
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  private async lockCharacter(
    client: PoolClient,
    characterId: string,
  ): Promise<CharacterItemRow> {
    const result = await client.query<
      Omit<CharacterItemRow, "capacity">
    >(
      `SELECT level, vocation, progression_definition_version,
         version, mana, soul
       FROM characters WHERE id = $1 FOR UPDATE`,
      [characterId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("character not found");
    return {
      ...row,
      capacity: deriveCharacterStats({
        vocation: row.vocation,
        definitionVersion: row.progression_definition_version,
        level: row.level,
      }).capacity,
    };
  }

  private async lockOwnedItemByType(
    client: PoolClient,
    characterId: string,
    itemTypeId: number,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(
      `WITH RECURSIVE owned AS (
         SELECT id, container_id, character_id, location_type, 1 AS depth
         FROM items
         WHERE character_id = $1
           AND location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.id, child.container_id, child.character_id,
           child.location_type, owned.depth + 1
         FROM items child
         JOIN owned ON child.container_id = owned.id
         WHERE child.location_type IN ('container', 'corpse')
           AND owned.depth < 8
       )
       SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE id IN (SELECT id FROM owned)
         AND item_type_id = $2
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [characterId, itemTypeId],
    );
    return result.rows[0];
  }

  private async lockItem(client: PoolClient, reference: string): Promise<ItemRow> {
    const row = await this.findLockedItem(client, reference);
    if (!row) throw new Error("item not found");
    return row;
  }

  private async lockItems(
    client: PoolClient,
    itemIds: ReadonlyArray<string>,
  ): Promise<Map<string, ItemRow>> {
    const uniqueIds = [...new Set(itemIds)].sort();
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [uniqueIds],
    );
    return new Map(result.rows.map((row) => [row.id, row]));
  }

  private async findLockedItem(
    client: PoolClient,
    reference: string,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE id::text = $1 OR seed_key = $1
       FOR UPDATE`,
      [reference],
    );
    if (result.rows.length > 1) throw new Error("item reference is ambiguous");
    return result.rows[0];
  }

  private async lockOrMaterializeWorldItem(
    client: PoolClient,
    reference: string,
    source?: WorldItemSource,
  ): Promise<ItemRow> {
    const existing = await this.findLockedItem(client, reference);
    if (existing) return existing;
    if (
      !source ||
      source.seedKey !== reference ||
      source.mapName !== this.mapName
    ) {
      throw new Error("item not found");
    }
    await this.materializeWorldItem(client, source);
    return this.lockItem(client, reference);
  }

  private async materializeWorldItem(
    client: PoolClient,
    source: WorldItemSource,
  ): Promise<void> {
    const payload: Array<Record<string, unknown>> = [];
    const appendContents = (
      contents: ReadonlyArray<WorldItemSourceContent>,
      parentId: string,
      parentSeedKey: string,
    ): void => {
      for (const [slot, content] of contents.entries()) {
        const id = randomUUID();
        const seedKey = `${parentSeedKey}:content:${slot}`;
        const state = this.persistedItemState(
          content.typeId,
          content.attributes,
          seedKey,
        );
        payload.push({
          id,
          seedKey,
          typeId: content.typeId,
          count: state.count,
          attributes: state.attributes,
          locationType: "container",
          containerId: parentId,
          slotIndex: slot,
        });
        appendContents(content.contents, id, seedKey);
      }
    };
    const id = randomUUID();
    const state = this.persistedItemState(
      source.typeId,
      source.attributes,
      source.seedKey,
    );
    payload.push({
      id,
      seedKey: source.seedKey,
      typeId: source.typeId,
      count: state.count,
      attributes: state.attributes,
      locationType: "world",
      containerId: null,
      slotIndex: null,
    });
    appendContents(source.contents, id, source.seedKey);

    await client.query(
      `WITH source AS (
         SELECT * FROM jsonb_to_recordset($7::jsonb) AS seed(
           id uuid, "seedKey" text, "typeId" integer, count smallint,
           attributes jsonb, "locationType" text, "containerId" uuid,
           "slotIndex" smallint
         )
       ), inserted AS (
         INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, container_id, slot_index,
           world_map_name, world_x, world_y, world_z, world_stack_index,
           seed_key, seed_map_name, seed_map_version,
           seed_x, seed_y, seed_z, seed_stack_index
         )
         SELECT id, "typeId", count, attributes, "locationType",
           null, "containerId", "slotIndex",
           CASE WHEN "locationType" = 'world' THEN $1 ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $3::integer ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $4::integer ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $5::smallint ELSE null END,
           CASE WHEN "locationType" = 'world' THEN $6::smallint ELSE null END,
           "seedKey", $1, $2, $3, $4, $5, $6
         FROM source
         ON CONFLICT (seed_key) DO NOTHING
         RETURNING id, item_type_id, count, seed_key
       ), audited AS (
         INSERT INTO audit_log(event_type, item_id, details)
         SELECT 'world-item-seeded', id,
           jsonb_build_object(
             'map', $1::text, 'mapVersion', $2::text,
             'seedKey', seed_key, 'itemTypeId', item_type_id, 'count', count,
             'reason', 'first-mutation'
           )
         FROM inserted
       )
       SELECT count(*) FROM inserted`,
      [
        source.mapName,
        source.mapVersion,
        source.position.x,
        source.position.y,
        source.position.z,
        source.stackIndex,
        JSON.stringify(payload),
      ],
    );
  }

  private persistedItemState(
    typeId: number,
    attributes: Readonly<Record<string, unknown>>,
    seedKey: string,
  ): { count: number; attributes: Readonly<Record<string, unknown>> } {
    const type = this.catalog.require(typeId);
    if (!type.stackable) {
      return { count: 1, attributes: { ...attributes } };
    }
    const rawCount = attributes.count;
    const count = rawCount === undefined || rawCount === 0 ? 1 : Number(rawCount);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > type.maxCount
    ) {
      throw new Error(`world item ${seedKey} has an invalid stack count`);
    }
    const { count: _count, ...persisted } = attributes;
    return { count, attributes: persisted };
  }

  private requireVersion(row: ItemRow, expectedVersion: number): void {
    if (row.version !== expectedVersion) throw new Error("stale item revision");
  }

  private async requireOwned(
    client: PoolClient,
    itemId: string,
    characterId: string,
  ): Promise<void> {
    const result = await client.query<{ character_id: string; location_type: string }>(
      `WITH RECURSIVE ancestry AS (
         SELECT id, container_id, character_id, location_type, 1 AS depth
         FROM items WHERE id = $1
         UNION ALL
         SELECT parent.id, parent.container_id, parent.character_id,
           parent.location_type, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 8
       )
       SELECT character_id, location_type
       FROM ancestry
       WHERE character_id IS NOT NULL
       ORDER BY depth DESC
       LIMIT 1`,
      [itemId],
    );
    const root = result.rows[0];
    if (
      root?.character_id !== characterId ||
      !["equipment", "inventory"].includes(root.location_type)
    ) {
      throw new Error("item is not owned by character");
    }
  }

  private async requireEquipmentCompatibility(
    client: PoolClient,
    characterId: string,
    itemId: string,
    slot: EquipmentSlot,
    slotType?: string,
  ): Promise<void> {
    if (slotType === "two-handed") {
      const shield = await client.query(
        `SELECT id FROM items
         WHERE character_id = $1 AND location_type = 'equipment'
           AND equipment_slot = 'shield' AND id <> $2
         FOR UPDATE`,
        [characterId, itemId],
      );
      if (shield.rowCount) throw new Error("two-handed weapon conflicts with shield");
    }
    if (slot === "shield") {
      const weapon = await client.query<{ item_type_id: number }>(
        `SELECT item_type_id FROM items
         WHERE character_id = $1 AND location_type = 'equipment'
           AND equipment_slot = 'weapon' AND id <> $2
         FOR UPDATE`,
        [characterId, itemId],
      );
      if (
        weapon.rows[0] &&
        this.catalog.require(weapon.rows[0].item_type_id).slotType === "two-handed"
      ) {
        throw new Error("shield conflicts with two-handed weapon");
      }
    }
  }

  private async lockEquipmentSlot(
    client: PoolClient,
    characterId: string,
    slot: EquipmentSlot,
    excludedItemId: string,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = $2 AND id <> $3
       FOR UPDATE`,
      [characterId, slot, excludedItemId],
    );
    return result.rows[0];
  }

  private async lockBackpack(
    client: PoolClient,
    characterId: string,
  ): Promise<ItemRow> {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'
       FOR UPDATE`,
      [characterId],
    );
    const row = this.requireRow(result.rows[0]);
    if ((this.catalog.require(row.item_type_id).containerCapacity ?? 0) < 1) {
      throw new Error("equipped backpack is not a container");
    }
    return row;
  }

  private async firstContainerSlot(
    client: PoolClient,
    container: ItemRow,
  ): Promise<number> {
    const capacity = this.catalog.require(container.item_type_id).containerCapacity ?? 0;
    const occupied = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE container_id = $1 AND location_type IN ('container', 'corpse')
       FOR UPDATE`,
      [container.id],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    const slot = Array.from({ length: capacity }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("container is full");
    return slot;
  }

  private async lockContainerSlot(
    client: PoolClient,
    containerId: string,
    slot: number,
  ): Promise<ItemRow | undefined> {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE container_id = $1
         AND location_type IN ('container', 'corpse')
         AND slot_index = $2
       FOR UPDATE`,
      [containerId, slot],
    );
    return result.rows[0];
  }

  private canMergeRows(
    source: ItemRow,
    target: ItemRow | undefined,
    count: number,
  ): target is ItemRow {
    if (!target || target.id === source.id || target.seed_key) return false;
    const type = this.catalog.require(source.item_type_id);
    return (
      type.stackable &&
      target.item_type_id === source.item_type_id &&
      JSON.stringify(target.attributes) === JSON.stringify(source.attributes) &&
      target.count + count <= type.maxCount
    );
  }

  private async lockContainerMergeTarget(
    client: PoolClient,
    containerId: string,
    source: ItemRow,
    count = source.count,
  ): Promise<ItemRow | undefined> {
    const type = this.catalog.require(source.item_type_id);
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE container_id = $1 AND location_type = 'container'
         AND item_type_id = $2 AND attributes = $3::jsonb
         AND seed_key IS NULL
         AND count + $4 <= $5
         AND id <> $6
       ORDER BY slot_index
       LIMIT 1
       FOR UPDATE`,
      [
        containerId,
        source.item_type_id,
        JSON.stringify(source.attributes),
        count,
        type.maxCount,
        source.id,
      ],
    );
    return result.rows[0];
  }

  private async requireContainerPlacement(
    client: PoolClient,
    itemId: string,
    destinationContainerId: string,
  ): Promise<void> {
    const ancestry = await client.query<{ id: string; depth: number }>(
      `WITH RECURSIVE ancestry AS (
         SELECT id, container_id, 1 AS depth
         FROM items
         WHERE id = $1
         UNION ALL
         SELECT parent.id, parent.container_id, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 9
       )
       SELECT id, depth FROM ancestry`,
      [destinationContainerId],
    );
    if (ancestry.rows.some((row) => row.id === itemId)) {
      throw new Error("item container cycle detected");
    }
    const descendants = await client.query<{ depth: number }>(
      `WITH RECURSIVE descendants AS (
         SELECT id, 1 AS depth
         FROM items
         WHERE id = $1
         UNION ALL
         SELECT child.id, descendants.depth + 1
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
           AND descendants.depth < 9
       )
       SELECT max(depth)::integer AS depth FROM descendants`,
      [itemId],
    );
    const destinationDepth = Math.max(
      0,
      ...ancestry.rows.map((row) => row.depth),
    );
    const descendantDepth = descendants.rows[0]?.depth ?? 1;
    if (destinationDepth + descendantDepth > 8) {
      throw new Error("item container nesting exceeds 8 levels");
    }
  }

  private async lockWorldMergeTarget(
    client: PoolClient,
    position: Position,
    source: ItemRow,
  ): Promise<ItemRow | undefined> {
    const type = this.catalog.require(source.item_type_id);
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE location_type = 'world' AND world_map_name = $1
         AND world_x = $2 AND world_y = $3 AND world_z = $4
         AND item_type_id = $5 AND attributes = $6::jsonb
         AND seed_key IS NULL AND count + $7 <= $8
       ORDER BY world_stack_index
       LIMIT 1
       FOR UPDATE`,
      [
        this.mapName,
        position.x,
        position.y,
        position.z,
        source.item_type_id,
        JSON.stringify(source.attributes),
        source.count,
        type.maxCount,
      ],
    );
    return result.rows[0];
  }

  private async firstInventorySlot(
    client: PoolClient,
    characterId: string,
  ): Promise<number> {
    const occupied = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       FOR UPDATE`,
      [characterId],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    const slot = Array.from({ length: 100 }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("inventory staging area is full");
    return slot;
  }

  private async firstWorldSlot(
    client: PoolClient,
    position: Position,
  ): Promise<number> {
    const occupied = await client.query<{ world_stack_index: number }>(
      `SELECT world_stack_index FROM items
       WHERE location_type IN ('world', 'house') AND world_map_name = $1
         AND world_x = $2 AND world_y = $3 AND world_z = $4
       FOR UPDATE`,
      [this.mapName, position.x, position.y, position.z],
    );
    const slots = new Set(occupied.rows.map((row) => row.world_stack_index));
    const slot = Array.from({ length: 16 }, (_, index) => index).find(
      (index) => !slots.has(index),
    );
    if (slot === undefined) throw new Error("world tile has too many items");
    return slot;
  }

  private async requireCapacity(
    client: PoolClient,
    characterId: string,
    capacity: number,
    addedItemId: string,
  ): Promise<void> {
    const result = await client.query<ItemRow>(OWNED_ITEMS_QUERY, [characterId]);
    if (result.rows.length > 500) throw new Error("character has excessive items");
    const added = await client.query<ItemRow>(
      `WITH RECURSIVE contents AS (
         SELECT i.*, 1 AS item_depth
         FROM items i
         WHERE i.id = $1
         UNION ALL
         SELECT child.*, contents.item_depth + 1
         FROM items child
         JOIN contents ON child.container_id = contents.id
         WHERE child.location_type IN ('container', 'corpse')
           AND contents.item_depth < 8
       )
       SELECT ${ITEM_COLUMNS}
       FROM contents
       LIMIT 501`,
      [addedItemId],
    );
    if (added.rows.length > 500) {
      throw new Error("world item has excessive nested contents");
    }
    const currentWeight = result.rows.reduce(
      (total, item) =>
        total + this.catalog.require(item.item_type_id).weight * item.count,
      0,
    );
    const addedWeight = added.rows.reduce(
      (total, item) =>
        total + this.catalog.require(item.item_type_id).weight * item.count,
      0,
    );
    if (currentWeight + addedWeight > capacity * 100) {
      throw new Error("character capacity exceeded");
    }
  }

  private async requireOwnedItemSpace(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    const result = await client.query<{ count: string }>(
      `WITH RECURSIVE owned AS (
         SELECT id
         FROM items
         WHERE character_id = $1
           AND location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.id
         FROM items child
         JOIN owned parent ON child.container_id = parent.id
         WHERE child.location_type IN ('container', 'corpse')
       )
       SELECT count(*)::text AS count FROM owned`,
      [characterId],
    );
    if (Number(result.rows[0]?.count ?? 0) >= 500) {
      throw new Error("character has excessive items");
    }
  }

  private async auditTransfer(
    client: PoolClient,
    characterId: string,
    before: Item,
    after: Item,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES ('item-transferred', $1, $2, $3::jsonb)`,
      [
        characterId,
        before.id,
        JSON.stringify({ from: before.location, to: after.location, count: after.count }),
      ],
    );
  }

  private async auditSplit(
    client: PoolClient,
    characterId: string,
    before: Item,
    sourceAfter: Item,
    created: Item,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES ('item-split', $1, $2, $3::jsonb)`,
      [
        characterId,
        before.id,
        JSON.stringify({
          originalCount: before.count,
          remainingCount: sourceAfter.count,
          createdItemId: created.id,
          createdCount: created.count,
          destination: created.location,
        }),
      ],
    );
  }

  private async auditTransform(
    client: PoolClient,
    characterId: string,
    itemId: string,
    fromTypeId: number,
    toTypeId: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-transformed', $1, $2,
         jsonb_build_object('fromTypeId', $3::integer, 'toTypeId', $4::integer)
       )`,
      [characterId, itemId, fromTypeId, toTypeId],
    );
  }

  private async auditMerge(
    client: PoolClient,
    characterId: string,
    survivor: Item,
    sourceItemId: string,
    movedCount: number,
    sourceRemaining: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-merged', $1, $2,
         jsonb_build_object(
           'sourceItemId', $3::text, 'movedCount', $4::integer,
           'sourceRemaining', $5::integer, 'resultCount', $6::integer
         )
       )`,
      [
        characterId,
        survivor.id,
        sourceItemId,
        movedCount,
        sourceRemaining,
        survivor.count,
      ],
    );
  }

  private async auditDestruction(
    client: PoolClient,
    characterId: string,
    item: Item,
    count: number,
    reason:
      | "rune"
      | "ammunition"
      | "break"
      | "food"
      | "conjure-source",
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-destroyed', $1, $2,
         jsonb_build_object(
           'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
         )
       )`,
      [characterId, item.id, item.typeId, count, reason],
    );
  }

  private async auditCreation(
    client: PoolClient,
    characterId: string,
    item: Item,
    reason: "conjuring",
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-created', $1, $2,
         jsonb_build_object(
           'itemTypeId', $3::integer, 'count', $4::integer, 'reason', $5::text
         )
       )`,
      [characterId, item.id, item.typeId, item.count, reason],
    );
  }

  private requireRow(row: ItemRow | undefined): ItemRow {
    if (!row) throw new Error("item operation returned no row");
    return row;
  }

  private requireReturnedItem(row: ItemRow | undefined): Item {
    return itemFromRow(this.requireRow(row));
  }
}
