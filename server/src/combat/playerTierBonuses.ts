import { tierBonusPercent } from "@tibia/protocol";
import { itemTierOf } from "../forge/itemTierOf";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";

export interface PlayerTierBonuses {
  /** Weapon onslaught: +60% damage proc chance, percent. */
  readonly fatalChancePercent: number;
  /** Armor ruse: full-dodge chance, percent. */
  readonly dodgeChancePercent: number;
  /** Helmet momentum: -2 s spell-cooldown proc chance, percent. */
  readonly momentumChancePercent: number;
}

/**
 * Forge tier bonuses from equipped tiered items (Feature 78), Canary
 * item.cpp:559-617: quadratic per-slot chances, with the boots-slot
 * amplification multiplying every other bonus. Transcendence (legs) waits
 * on Feature 79's avatars and is recorded as a residual there.
 */
export function playerTierBonuses(
  equipment: ReadonlyArray<{ item: Item; type: ItemType }>,
): PlayerTierBonuses {
  let weaponTier = 0;
  let armorTier = 0;
  let helmetTier = 0;
  let bootsTier = 0;
  for (const entry of equipment) {
    const tier = itemTierOf(entry.item);
    if (tier <= 0) continue;
    switch (entry.item.location.kind === "equipment" ? entry.item.location.slot : entry.type.equipmentSlot) {
      case "weapon":
        weaponTier = tier;
        break;
      case "armor":
        armorTier = tier;
        break;
      case "helmet":
        helmetTier = tier;
        break;
      case "boots":
        bootsTier = tier;
        break;
      default:
        break;
    }
  }
  const amplification = 1 + tierBonusPercent("amplification", bootsTier) / 100;
  return {
    fatalChancePercent: tierBonusPercent("onslaught", weaponTier) * amplification,
    dodgeChancePercent: tierBonusPercent("ruse", armorTier) * amplification,
    momentumChancePercent:
      tierBonusPercent("momentum", helmetTier) * amplification,
  };
}
