import type { Position } from "@tibia/protocol";

const GROUND_FLOOR = 7;
const MAX_FLOOR = 15;
const UNDERGROUND_FLOOR_AWARENESS = 2;

/**
 * The floors whose dynamic contents (creatures, mutable tile items) a viewer at
 * `position` may receive, given the cover-aware top floor `firstFloor` from
 * `getFirstVisibleFloor`. Surface viewers see down to the ground floor;
 * underground viewers see down to UNDERGROUND_FLOOR_AWARENESS floors below.
 *
 * This is the single source of truth for the visible floor set, shared by the
 * creature and map-item send paths so send-filtering stays in lockstep with
 * `canSee` (which applies the same bounds as its per-tile gate). Ascending
 * order (deepest last); callers collect into sets/arrays, so order is
 * irrelevant.
 */
export function visibleFloorRange(
  position: Position,
  firstFloor: number,
): number[] {
  const lastFloor =
    position.z > GROUND_FLOOR
      ? Math.min(MAX_FLOOR, position.z + UNDERGROUND_FLOOR_AWARENESS)
      : GROUND_FLOOR;
  if (lastFloor < firstFloor) return [];
  return Array.from(
    { length: lastFloor - firstFloor + 1 },
    (_, index) => firstFloor + index,
  );
}
