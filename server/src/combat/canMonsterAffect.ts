import type { Creature } from "../creature/Creature";
import type { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { World } from "../World";

export function canMonsterAffect(
  world: World,
  monster: Monster,
  target: Creature,
): boolean {
  return (
    !(target instanceof Player) ||
    (!world.isProtectionZone(monster.position) &&
      !world.isProtectionZone(target.position))
  );
}
