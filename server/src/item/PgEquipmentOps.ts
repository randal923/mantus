import type {
  EquipmentSlot,
  ItemContainerDestination,
} from "@tibia/protocol";
import type { Pool } from "pg";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireRow } from "./requireRow";
import { requireVersion } from "./requireVersion";
import { equipDisplaceToInventoryUpdate } from "./sql/equipDisplaceToInventoryUpdate";
import { equipItemUpdate } from "./sql/equipItemUpdate";
import { equipRestoreDisplacedToContainerUpdate } from "./sql/equipRestoreDisplacedToContainerUpdate";
import { equipRestoreDisplacedToInventoryUpdate } from "./sql/equipRestoreDisplacedToInventoryUpdate";
import { unequipToContainerUpdate } from "./sql/unequipToContainerUpdate";
import { unequipToInventoryUpdate } from "./sql/unequipToInventoryUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

export class PgEquipmentOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
  ) {}

  equip(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    slot: EquipmentSlot,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      const character = await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
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
      const occupied = await this.locks.lockEquipmentSlot(
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
          await this.guards.requireContainerPlacement(
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
        const temporarySlot = await this.locks.firstInventorySlot(
          client,
          characterId,
        );
        await client.query(equipDisplaceToInventoryUpdate, [
          occupied.id,
          displacedTypeId,
          characterId,
          temporarySlot,
        ]);
      }
      await this.guards.requireEquipmentCompatibility(
        client,
        characterId,
        row.id,
        slot,
        type.slotType,
      );
      const updated = await client.query<ItemRow>(equipItemUpdate, [
        characterId,
        row.id,
        transformedTypeId,
        slot,
      ]);
      const after = requireReturnedItem(updated.rows[0]);
      let displaced: Item | undefined;
      if (occupied && displacedTypeId !== undefined) {
        const displacedResult =
          row.location_type === "inventory"
            ? await client.query<ItemRow>(
                equipRestoreDisplacedToInventoryUpdate,
                [occupied.id, characterId, row.slot_index],
              )
            : await client.query<ItemRow>(
                equipRestoreDisplacedToContainerUpdate,
                [occupied.id, row.container_id, row.slot_index],
              );
        displaced = requireReturnedItem(displacedResult.rows[0]);
      }
      await this.audit.transfer(client, characterId, before, after);
      if (displacedBefore && displaced) {
        await this.audit.transfer(
          client,
          characterId,
          displacedBefore,
          displaced,
        );
      }
      if (transformedTypeId !== row.item_type_id) {
        await this.audit.transform(
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
        await this.audit.transform(
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
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
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
        const container = await this.locks.lockItem(
          client,
          destination.containerId,
        );
        requireVersion(container, destination.containerRevision);
        await this.guards.requireOwned(client, container.id, characterId);
        const capacity =
          this.catalog.require(container.item_type_id).containerCapacity ?? 0;
        if (destination.slot >= capacity) {
          throw new Error("container slot is out of range");
        }
        await this.guards.requireContainerPlacement(
          client,
          row.id,
          container.id,
        );
        if (
          await this.locks.lockContainerSlot(
            client,
            container.id,
            destination.slot,
          )
        ) {
          throw new Error("container slot is occupied");
        }
        const result = await client.query<ItemRow>(unequipToContainerUpdate, [
          row.id,
          transformedTypeId,
          container.id,
          destination.slot,
        ]);
        updated = requireRow(result.rows[0]);
      } else if (slot === "backpack") {
        const destinationSlot = await this.locks.firstInventorySlot(
          client,
          characterId,
        );
        const result = await client.query<ItemRow>(unequipToInventoryUpdate, [
          characterId,
          row.id,
          transformedTypeId,
          destinationSlot,
        ]);
        updated = requireRow(result.rows[0]);
      } else {
        const backpack = await this.locks.lockBackpack(client, characterId);
        const destinationSlot = await this.locks.firstContainerSlot(
          client,
          backpack,
        );
        const result = await client.query<ItemRow>(unequipToContainerUpdate, [
          row.id,
          transformedTypeId,
          backpack.id,
          destinationSlot,
        ]);
        updated = requireRow(result.rows[0]);
      }
      const after = itemFromRow(updated);
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
    });
  }
}
