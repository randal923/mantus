import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";

export function playerMagicLevel(
  player: Player,
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  /** Flat additions from running imbuements (Feature 78). */
  imbuementBoost = 0,
): number {
  const equipped =
    player.progression.magicLevel +
    player.wheelBonuses.skillBoosts.magic +
    imbuementBoost +
    equipment.reduce(
        (total, entry) => total + (entry.type.magicLevelPoints ?? 0),
        0,
      );
  return Math.max(0, equipped + player.conditions.magicLevelModifier(equipped));
}
