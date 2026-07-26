import type { ItemType } from "../item/ItemType";

/**
 * Canary's equipment filter for bonus reward rolls (monster.lua:187-201):
 * armor, amulet, boots, helmet, legs, ring, shield plus axe/club/distance/
 * sword/wand weapons and quivers; ammunition, fist weapons and spellbooks
 * stay excluded. Mapped onto the catalog's structural fields.
 */
export function isBossEquipmentReward(type: ItemType): boolean {
  if (type.equipmentSlot === "ammo" || type.weaponType === "ammunition") {
    return false;
  }
  if (type.weaponType === "fist" || type.weaponType === "spellbook") {
    return false;
  }
  if (type.weaponType !== undefined) return true;
  switch (type.equipmentSlot) {
    case "armor":
    case "helmet":
    case "legs":
    case "boots":
    case "shield":
    case "amulet":
    case "ring":
      return true;
    default:
      return false;
  }
}
