import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";

export function playerMagicLevel(
  player: Player,
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
): number {
  return Math.max(
    0,
    player.progression.magicLevel +
      equipment.reduce(
        (total, entry) => total + (entry.type.magicLevelPoints ?? 0),
        0,
      ),
  );
}
