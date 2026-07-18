import type { CombatTarget, Position } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { directionDelta } from "./directionDelta";

export interface ResolvedSpellTarget {
  readonly position: Position;
  readonly creature: Creature | null;
}

export function resolveSpellTarget(
  world: World,
  session: Session,
  player: Player,
  target: CombatTarget,
): ResolvedSpellTarget | null {
  if (target.kind === "self") {
    return { position: player.position, creature: player };
  }
  if (target.kind === "direction") {
    const [x, y] = directionDelta(player.direction);
    return {
      position: {
        x: player.position.x + x,
        y: player.position.y + y,
        z: player.position.z,
      },
      creature: null,
    };
  }
  if (target.kind === "position") {
    if (
      target.position.z !== player.position.z ||
      !world.getTile(target.position) ||
      !world.canSee(player.position, target.position, session.viewRange)
    ) {
      return null;
    }
    return { position: target.position, creature: null };
  }
  const creatureId =
    target.kind === "attack-target"
      ? session.attackTargetId
      : target.creatureId;
  const creature = creatureId
    ? world.getCreature(creatureId)
    : undefined;
  if (
    !creature ||
    !session.knownCreatureIds.has(creature.id) ||
    !world.canSee(player.position, creature.position, session.viewRange)
  ) {
    return null;
  }
  return { position: creature.position, creature };
}
