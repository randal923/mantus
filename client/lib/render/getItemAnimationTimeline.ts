import type { TibiaObject } from "./AssetStore";

const LEGACY_ITEM_PHASE_DURATION_MS = 500;

interface AnimatedItemAppearance {
  phases: number;
  animation?: TibiaObject["animation"];
}

export interface ItemAnimationTimeline {
  phaseDurations: number[];
  rotated: number[];
  cycleDuration: number;
  loopCount: number;
}

/** Precomputes the seed-dependent phase schedule so per-frame lookups stay cheap. */
export function getItemAnimationTimeline(
  appearance: AnimatedItemAppearance,
  instanceSeed: number,
): ItemAnimationTimeline {
  const phaseCount = Math.max(1, Math.floor(appearance.phases));
  if (phaseCount === 1) {
    return { phaseDurations: [1], rotated: [0], cycleDuration: 1, loopCount: 0 };
  }

  const animation = appearance.animation;
  const timingMode = animation?.timingMode ?? "asynchronous";
  const seed = Number.isFinite(instanceSeed) ? instanceSeed >>> 0 : 0;
  const durationSeed = timingMode === "asynchronous" ? seed : 0;
  const phaseDurations = Array.from({ length: phaseCount }, (_, phase) => {
    const metadata = animation?.phases[phase];
    const minimum = Math.max(
      1,
      Math.floor(metadata?.minimumDurationMs ?? LEGACY_ITEM_PHASE_DURATION_MS),
    );
    const maximum = Math.max(
      minimum,
      Math.floor(metadata?.maximumDurationMs ?? minimum),
    );
    const range = maximum - minimum + 1;
    const mixed = Math.imul(durationSeed ^ (phase + 1), 2_654_435_761) >>> 0;
    return minimum + (mixed % range);
  });

  const loopType = animation?.loopType ?? "infinite";
  const sequence = Array.from({ length: phaseCount }, (_, phase) => phase);
  if (loopType === "ping-pong" && phaseCount > 2) {
    for (let phase = phaseCount - 2; phase > 0; phase--) sequence.push(phase);
  }

  const configuredStart = animation?.startPhase;
  const startPhase =
    configuredStart === null || configuredStart === undefined
      ? timingMode === "asynchronous"
        ? seed % phaseCount
        : 0
      : Math.min(phaseCount - 1, Math.max(0, configuredStart));
  const startIndex = Math.max(0, sequence.indexOf(startPhase));
  const asynchronousOffset =
    timingMode === "asynchronous" && configuredStart !== null && configuredStart !== undefined
      ? seed % sequence.length
      : 0;
  const rotated = Array.from(
    { length: sequence.length },
    (_, index) => sequence[(startIndex + asynchronousOffset + index) % sequence.length],
  );
  const cycleDuration = rotated.reduce(
    (total, phase) => total + phaseDurations[phase],
    0,
  );
  const loopCount =
    loopType === "counted" ? Math.max(1, animation?.loopCount ?? 1) : 0;

  return { phaseDurations, rotated, cycleDuration, loopCount };
}
