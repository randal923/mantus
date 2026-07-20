import { validateWheelAllocation } from "@tibia/protocol";

/**
 * Returns the draft with one slice changed, or null when the resulting
 * allocation would violate the shared wheel rules (budget, caps,
 * connectivity). The server re-validates on save; this only drives the UI.
 */
export function trySetWheelSlice(
  draft: ReadonlyArray<number>,
  sliceId: number,
  points: number,
  totalPoints: number,
): number[] | null {
  const next = [...draft];
  next[sliceId - 1] = points;
  return validateWheelAllocation(next, totalPoints).ok ? next : null;
}
