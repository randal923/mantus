import type { EquipmentSlot } from "@tibia/protocol";
import type { PoolClient } from "pg";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";
import type { ItemType } from "./ItemType";
import { isQuiverType } from "./isQuiverType";
import { containerAncestryQuery } from "./sql/containerAncestryQuery";
import { containerDescendantDepthQuery } from "./sql/containerDescendantDepthQuery";
import { itemContentsQuery } from "./sql/itemContentsQuery";
import { itemOwnershipQuery } from "./sql/itemOwnershipQuery";
import { lockConflictingShieldQuery } from "./sql/lockConflictingShieldQuery";
import { lockConflictingWeaponQuery } from "./sql/lockConflictingWeaponQuery";
import { ownedItemCountQuery } from "./sql/ownedItemCountQuery";
import { ownedItemsQuery } from "./sql/ownedItemsQuery";

export class PgItemGuards {
  constructor(private readonly catalog: ItemCatalog) {}

  async requireOwned(
    client: PoolClient,
    itemId: string,
    characterId: string,
  ): Promise<void> {
    const result = await client.query<{
      character_id: string;
      location_type: string;
    }>(itemOwnershipQuery, [itemId]);
    const root = result.rows[0];
    if (
      root?.character_id !== characterId ||
      root.location_type !== "equipment"
    ) {
      throw new Error("item is not owned by character");
    }
  }

  async requireEquipmentCompatibility(
    client: PoolClient,
    characterId: string,
    itemId: string,
    slot: EquipmentSlot,
    type: ItemType,
  ): Promise<void> {
    // Mirrors planEquip: both hands free for a two-handed item, except a
    // distance weapon sharing hands with a quiver (Canary player.cpp:4552).
    if (type.slotType === "two-handed") {
      const shield = await client.query<{ item_type_id: number }>(
        lockConflictingShieldQuery,
        [characterId, itemId],
      );
      const shieldType = shield.rows[0]
        ? this.catalog.require(shield.rows[0].item_type_id)
        : undefined;
      if (
        shieldType &&
        !(type.weaponType === "distance" && isQuiverType(shieldType))
      ) {
        throw new Error("two-handed weapon conflicts with shield");
      }
    }
    if (slot === "shield") {
      const weapon = await client.query<{ item_type_id: number }>(
        lockConflictingWeaponQuery,
        [characterId, itemId],
      );
      const weaponType = weapon.rows[0]
        ? this.catalog.require(weapon.rows[0].item_type_id)
        : undefined;
      if (
        weaponType?.slotType === "two-handed" &&
        !(isQuiverType(type) && weaponType.weaponType === "distance")
      ) {
        throw new Error("shield conflicts with two-handed weapon");
      }
    }
  }

  async requireContainerPlacement(
    client: PoolClient,
    itemId: string,
    destinationContainerId: string,
  ): Promise<void> {
    const ancestry = await client.query<{ id: string; depth: number }>(
      containerAncestryQuery,
      [destinationContainerId],
    );
    if (ancestry.rows.some((row) => row.id === itemId)) {
      throw new Error("item container cycle detected");
    }
    const descendants = await client.query<{ depth: number }>(
      containerDescendantDepthQuery,
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

  async requireCapacity(
    client: PoolClient,
    characterId: string,
    capacity: number,
    addedItemId: string,
  ): Promise<void> {
    const result = await client.query<ItemRow>(ownedItemsQuery, [characterId]);
    if (result.rows.length > 500) {
      throw new Error("character has excessive items");
    }
    const added = await client.query<ItemRow>(itemContentsQuery, [addedItemId]);
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

  async requireOwnedItemSpace(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    const result = await client.query<{ count: string }>(ownedItemCountQuery, [
      characterId,
    ]);
    if (Number(result.rows[0]?.count ?? 0) >= 500) {
      throw new Error("character has excessive items");
    }
  }
}
