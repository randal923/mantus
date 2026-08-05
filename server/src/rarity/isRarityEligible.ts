import type { ItemType } from "../item/ItemType";
import { isBossEquipmentReward } from "../reward/isBossEquipmentReward";

/**
 * Gear that may roll a rarity grade: the boss-reward equipment filter minus
 * stackables. Spears and throwing weapons are equipable but stack, and one
 * affix roll covering a whole stack breaks both merge semantics and balance.
 */
export function isRarityEligible(type: ItemType): boolean {
  if (type.stackable) return false;
  return isBossEquipmentReward(type);
}
