import {
  WHEEL_ADJACENCY,
  WHEEL_LIMITS,
  WHEEL_RING_POINT_GATES,
  WHEEL_ROOT_SLICES,
  WHEEL_SLICES,
} from "./wheel";

export type WheelValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Validates a full wheel allocation snapshot against the character's earned
 * point budget. Mirrors Canary's layered save checks: per-slice caps, ring
 * point gates, root reachability through completely-full slices, and the
 * global budget — all at execution time.
 */
export function validateWheelAllocation(
  slices: ReadonlyArray<number>,
  totalPoints: number,
): WheelValidationResult {
  if (slices.length !== WHEEL_LIMITS.sliceCount) {
    return { ok: false, reason: "slice count mismatch" };
  }
  let allocated = 0;
  for (const definition of WHEEL_SLICES) {
    const points = slices[definition.id - 1] ?? 0;
    if (!Number.isInteger(points) || points < 0) {
      return { ok: false, reason: `slice ${definition.id} points invalid` };
    }
    if (points > definition.maxPoints) {
      return { ok: false, reason: `slice ${definition.id} over capacity` };
    }
    allocated += points;
  }
  if (allocated > totalPoints) {
    return { ok: false, reason: "allocation exceeds earned points" };
  }
  for (const definition of WHEEL_SLICES) {
    const points = slices[definition.id - 1] ?? 0;
    if (points === 0 || definition.ring === 1) continue;
    if (allocated < WHEEL_RING_POINT_GATES[definition.ring]) {
      return { ok: false, reason: `slice ${definition.id} ring gate not met` };
    }
  }
  // A slice may hold points only while reachable from a root through a chain
  // of completely-full slices; fixed-point iteration rejects "floating
  // islands" of mutually-full slices detached from the center.
  const reachable = new Set<number>(WHEEL_ROOT_SLICES);
  const isFull = (id: number): boolean => {
    const definition = WHEEL_SLICES[id - 1];
    return definition !== undefined && (slices[id - 1] ?? 0) === definition.maxPoints;
  };
  let grew = true;
  while (grew) {
    grew = false;
    for (const definition of WHEEL_SLICES) {
      if (reachable.has(definition.id)) continue;
      const neighbors = WHEEL_ADJACENCY.get(definition.id) ?? [];
      if (neighbors.some((n) => reachable.has(n) && isFull(n))) {
        reachable.add(definition.id);
        grew = true;
      }
    }
  }
  for (const definition of WHEEL_SLICES) {
    const points = slices[definition.id - 1] ?? 0;
    if (points > 0 && !reachable.has(definition.id)) {
      return { ok: false, reason: `slice ${definition.id} not connected` };
    }
  }
  return { ok: true };
}
