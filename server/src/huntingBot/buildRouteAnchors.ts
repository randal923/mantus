import { HUNTING_BOT_LIMITS, type Position } from "@tibia/protocol";
import type { RouteMap } from "./RouteMap";
import { snapToWalkable } from "./snapToWalkable";

/**
 * Turns a hunting guide's straight-line route into the anchor chain the
 * tracer paths between.
 *
 * A guide segment can be 130 tiles of dead-reckoned line. Pathing that in one
 * search is both expensive and wrong: breadth-first search finds *a* way, not
 * the way the guide meant, and in open terrain it will happily leave the
 * intended corridor. Sampling the straight line every few tiles keeps every
 * search small and keeps the traced route on top of the line the guide drew.
 *
 * Points that cannot be snapped onto real ground are dropped when they are
 * only intermediate samples; a segment endpoint that cannot be snapped is
 * kept as-is and marked, so the window can show the player which leg needs a
 * hand-placed waypoint.
 */
export function buildRouteAnchors(
  map: RouteMap,
  points: ReadonlyArray<Position>,
): Array<{ readonly position: Position; readonly snapped: boolean }> {
  const anchors: Array<{ position: Position; snapped: boolean }> = [];
  const push = (position: Position, snapped: boolean): void => {
    const last = anchors.at(-1);
    if (
      last &&
      last.position.x === position.x &&
      last.position.y === position.y &&
      last.position.z === position.z
    ) {
      return;
    }
    anchors.push({ position, snapped });
  };
  const first = points[0];
  if (!first) return anchors;
  const firstSnap = snapToWalkable(map, first, HUNTING_BOT_LIMITS.maxSnapRadius);
  push(firstSnap ?? { ...first }, firstSnap !== null);
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    for (const sample of sampleLine(from, to)) {
      const snap = snapToWalkable(map, sample, HUNTING_BOT_LIMITS.maxSnapRadius);
      if (snap) push(snap, true);
    }
    const snap = snapToWalkable(map, to, HUNTING_BOT_LIMITS.maxSnapRadius);
    push(snap ?? { ...to }, snap !== null);
  }
  return anchors;
}

/** Interior samples of the straight line, spaced but never including the ends. */
function sampleLine(from: Position, to: Position): Position[] {
  if (from.z !== to.z) return [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  const spacing = HUNTING_BOT_LIMITS.traceAnchorSpacing;
  const count = Math.min(
    HUNTING_BOT_LIMITS.maxLegSamples,
    Math.floor(distance / spacing),
  );
  const samples: Position[] = [];
  for (let step = 1; step <= count; step++) {
    const ratio = (step * spacing) / distance;
    if (ratio >= 1) break;
    samples.push({
      x: from.x + Math.round(dx * ratio),
      y: from.y + Math.round(dy * ratio),
      z: from.z,
    });
  }
  return samples;
}
