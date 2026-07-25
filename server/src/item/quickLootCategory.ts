import type { QuickLootCategory } from "@tibia/protocol";
import type { ItemType } from "./ItemType";

/**
 * Sorts one item type into the quick-loot buckets, Canary's `ObjectCategory`
 * reduced to what this server actually distinguishes. Derived from structural
 * catalog fields (slot, weapon type, worth, capacity, food) rather than the
 * wiki's free-text `primaryType`, so it stays stable across catalog rebuilds.
 *
 * `none` means "quick loot never takes this": an item a player could not pick
 * up by hand cannot be swept into a backpack either.
 */
export function quickLootCategory(type: ItemType): QuickLootCategory {
  if (!type.pickupable) return "none";
  if (type.worth !== undefined && type.stackable) return "gold";
  if (type.equipmentSlot === "ammo" || type.weaponType === "ammunition") {
    return "ammunition";
  }
  if (type.equipmentSlot === "weapon" || type.weaponType !== undefined) {
    return "weapon";
  }
  if (
    type.equipmentSlot === "armor" ||
    type.equipmentSlot === "helmet" ||
    type.equipmentSlot === "legs" ||
    type.equipmentSlot === "boots" ||
    type.equipmentSlot === "shield" ||
    type.equipmentSlot === "amulet" ||
    type.equipmentSlot === "ring"
  ) {
    return "equipment";
  }
  if ((type.containerCapacity ?? 0) > 0) return "container";
  if (type.kind === "rune") return "rune";
  if (type.food) return "food";
  if (type.worth !== undefined) return "valuable";
  return "other";
}
