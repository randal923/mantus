import type { PreyBonusType } from "@tibia/protocol";
import { PREY_BONUS_TYPES } from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";

/**
 * Bonus rarity roll (Canary PreySlot::reloadBonusValue, ioprey.cpp:41-55):
 * strictly increasing — from below 9 the next rarity is uniform in
 * [current + 1, 10]; from 9 or 10 it pins to 10. Resets to 1 only via a full
 * bonus erase.
 */
export function rollBonusRarity(current: number, rng: WorldActionRng): number {
  if (current >= 9) return 10;
  return rng.integer(current + 1, 10);
}

/**
 * Bonus type roll (Canary PreySlot::reloadBonusType, ioprey.cpp:29-39),
 * using the rarity as it was BEFORE the value roll: at rarity 10 the new
 * type is guaranteed different, otherwise uniform over all four.
 */
export function rollBonusType(
  current: PreyBonusType | null,
  rarityBeforeRoll: number,
  rng: WorldActionRng,
): PreyBonusType {
  if (rarityBeforeRoll === 10 && current !== null) {
    const others = PREY_BONUS_TYPES.filter((type) => type !== current);
    return others[rng.integer(0, others.length - 1)] ?? current;
  }
  return PREY_BONUS_TYPES[rng.integer(0, PREY_BONUS_TYPES.length - 1)] ?? "damage";
}

/** Percentage formulas by type (ioprey.cpp:49-54). */
export function preyBonusPercentageFor(
  type: PreyBonusType,
  rarity: number,
): number {
  if (type === "damage") return 2 * rarity + 5;
  if (type === "defense") return 2 * rarity + 10;
  return 3 * rarity + 10;
}
