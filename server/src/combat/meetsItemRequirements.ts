import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";

export function meetsItemRequirements(player: Player, item: ItemType): boolean {
  return (
    (item.requirements?.level === undefined ||
      player.level >= item.requirements.level) &&
    (!item.requirements?.vocations ||
      item.requirements.vocations.includes(player.vocation))
  );
}
