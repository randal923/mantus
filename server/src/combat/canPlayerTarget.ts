import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { Session } from "../Session";
import type { World } from "../World";

export function canPlayerTarget(
  world: World,
  session: Session,
  player: Player,
  target: Creature,
  pvp?: PvpHooks,
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
  if (
    !(target instanceof Player) ||
    world.isProtectionZone(player.position) ||
    world.isProtectionZone(target.position)
  ) {
    return false;
  }
  if (pvp) {
    // Re-evaluated at execution time: world type, no-pvp zones, protection
    // level, black-skull restriction, and secure mode vs viewer-relative
    // marks all live in the pvp gate.
    return pvp.canTarget(session, player, target);
  }
  return (
    !session.fightMode.secure &&
    !world.isNoPvpZone(player.position) &&
    !world.isNoPvpZone(target.position)
  );
}
