import type { ItemAnimationTimeline } from "./getItemAnimationTimeline";

/** Maps elapsed time onto a precomputed timeline; safe to call every frame. */
export function resolveItemAnimationPhase(
  timeline: ItemAnimationTimeline,
  elapsedMs: number,
): number {
  const { phaseDurations, rotated, cycleDuration, loopCount } = timeline;
  const safeElapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.floor(elapsedMs))
    : 0;
  if (loopCount > 0 && safeElapsed >= cycleDuration * loopCount) {
    return rotated.at(-1) ?? 0;
  }

  const cycleElapsed = safeElapsed % cycleDuration;
  let boundary = 0;
  for (const phase of rotated) {
    boundary += phaseDurations[phase];
    if (cycleElapsed < boundary) return phase;
  }
  return rotated.at(-1) ?? 0;
}
