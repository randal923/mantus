import type { TibiaObject } from "./AssetStore";
import { getItemAnimationTimeline } from "./getItemAnimationTimeline";
import { resolveItemAnimationPhase } from "./resolveItemAnimationPhase";

interface AnimatedItemAppearance {
  phases: number;
  animation?: TibiaObject["animation"];
}

/** Resolves a map item's visual phase without changing authoritative state. */
export function getItemAnimationPhase(
  appearance: AnimatedItemAppearance,
  elapsedMs: number,
  instanceSeed: number,
): number {
  if (Math.max(1, Math.floor(appearance.phases)) === 1) return 0;
  const timeline = getItemAnimationTimeline(appearance, instanceSeed);
  return resolveItemAnimationPhase(timeline, elapsedMs);
}
