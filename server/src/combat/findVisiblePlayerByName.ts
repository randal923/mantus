import { isInRange } from "./isInRange";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";

/**
 * Resolves a spoken spell parameter ("exura sio \"Friend\"") to an online
 * player. The name is only ever a reference: the candidate must already be
 * known to this session, inside its view, and within the spell's range, and
 * every check runs here at execution time inside the tick. A name that is
 * offline, out of view, or out of range resolves to nothing rather than
 * confirming where that character is (charter rules 1, 4, 6).
 */
export function findVisiblePlayerByName(
  world: World,
  registry: SessionRegistry,
  session: Session,
  caster: Player,
  name: string,
  range: number,
): Player | null {
  const wanted = name.trim().toLowerCase();
  if (wanted.length === 0) return null;
  for (const other of registry.all()) {
    const candidate = other.playerId
      ? world.getPlayer(other.playerId)
      : undefined;
    if (
      !candidate ||
      candidate.name.toLowerCase() !== wanted ||
      !isInRange(caster.position, candidate.position, range) ||
      !session.knownCreatureIds.has(candidate.id) ||
      !world.canSee(caster.position, candidate.position, session.viewRange)
    ) {
      continue;
    }
    return candidate;
  }
  return null;
}
