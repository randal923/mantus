import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { World } from "../World";

export function canMonsterAffect(
  world: World,
  monster: Monster,
  target: Creature,
): boolean {
  if (target === monster || target.kind === "npc") return false;
  if (target instanceof Monster) {
    return monster.type.enemyFactions.includes(target.type.faction);
  }
  if (!(target instanceof Player)) return false;
  const attacksPlayers =
    monster.type.enemyFactions.length === 0 ||
    monster.type.enemyFactions.includes("FACTION_PLAYER");
  return (
    attacksPlayers &&
    !world.isProtectionZone(monster.position) &&
    !world.isProtectionZone(target.position)
  );
}
