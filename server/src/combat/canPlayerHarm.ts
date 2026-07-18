import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { canPlayerTarget } from "./canPlayerTarget";

export function canPlayerHarm(
  world: World,
  session: Session,
  player: Player,
  target: Creature,
): boolean {
  if (
    target === player ||
    target.kind === "npc" ||
    target.health <= 0 ||
    world.getCreature(target.id) !== target
  ) {
    return false;
  }
  if (target instanceof Monster) {
    return (
      target.type.flags.attackable &&
      !world.isProtectionZone(player.position) &&
      !world.isProtectionZone(target.position)
    );
  }
  return canPlayerTarget(world, session, player, target);
}
