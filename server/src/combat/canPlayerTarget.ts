import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";

export function canPlayerTarget(
  world: World,
  session: Session,
  player: Player,
  target: Creature,
): boolean {
  if (
    target.id === player.id ||
    target.health <= 0 ||
    target.conditions.has("invisible") ||
    target.position.z !== player.position.z
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
  return (
    target instanceof Player &&
    !session.fightMode.secure &&
    !world.isProtectionZone(player.position) &&
    !world.isProtectionZone(target.position) &&
    !world.isNoPvpZone(player.position) &&
    !world.isNoPvpZone(target.position)
  );
}
