import type { Position, ViewRange } from "@tibia/protocol";
import { findPath } from "../pathfinding/findPath";
import type { Player } from "../Player";
import type { World } from "../World";

/** Search budget: comfortably above the largest view box (65 × 49 tiles). */
const MAX_REACH_VISITED = 4_096;

/**
 * Whether a killer may auto-loot a corpse from where they stand: same floor,
 * inside their own view range, and a pathable route to a tile next to it.
 * This is Canary's `Creature::onDeath` rule (`getPathMatching` with
 * `maxTargetDist = 1` gates `playerQuickLootCorpse`), so a ranged kill sweeps
 * the corpse the player can see and walk to, while a corpse behind a wall or
 * across water is left alone. Hand looting keeps its one-tile reach.
 *
 * Creatures standing in the way do not block: they move, and the sweep runs
 * once, on the death tick.
 */
export function isCorpseReachable(
  world: World,
  player: Player,
  viewRange: ViewRange,
  corpse: Position,
  now: number,
): boolean {
  const from = player.position;
  if (from.z !== corpse.z) return false;
  const inView = (position: Position) =>
    Math.abs(position.x - from.x) <= viewRange.x &&
    Math.abs(position.y - from.y) <= viewRange.y;
  if (!inView(corpse)) return false;
  const distance = (position: Position) =>
    Math.max(Math.abs(position.x - corpse.x), Math.abs(position.y - corpse.y));
  if (distance(from) <= 1) return true;
  return findPath({
    start: from,
    isGoal: (position) => distance(position) <= 1,
    canStep: (position) =>
      inView(position) && world.canCreaturePathTo(player, position, now),
    maxVisited: MAX_REACH_VISITED,
    heuristic: distance,
  }).complete;
}
