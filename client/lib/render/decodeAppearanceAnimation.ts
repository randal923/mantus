import type { TibiaAnimation } from "./AssetStore";

/** One compact entry of `appearance-animations.json`. */
export interface AppearanceAnimationEntry {
  /** Per-phase minimum duration, or one number when every phase shares it. */
  d: number | number[];
  /** Per-phase maximum, only present when it differs from the minimum. */
  x?: number | number[];
  /** 1 when every instance of the object animates on the same clock. */
  s?: 1;
  /** Start phase; null asks for a per-instance random one. */
  p?: number | null;
  l?: "ping-pong" | "counted";
  c?: number;
}

function at(value: number | number[], phase: number): number {
  return typeof value === "number" ? value : (value[phase] ?? value[0] ?? 0);
}

/**
 * Expands one entry into the animation the renderer consumes. The table is
 * Tibia's own schedule, so this is what makes an item animate at the speed the
 * official client plays it at rather than at a made-up fallback rate.
 */
export function decodeAppearanceAnimation(
  entry: AppearanceAnimationEntry,
  phaseCount: number,
): TibiaAnimation {
  return {
    source: "appearances",
    timingMode: entry.s === 1 ? "synchronized" : "asynchronous",
    loopType: entry.l ?? "infinite",
    loopCount: entry.l === "counted" ? (entry.c ?? 1) : 0,
    startPhase: entry.p === undefined ? 0 : entry.p,
    phases: Array.from({ length: phaseCount }, (_, phase) => {
      const minimumDurationMs = at(entry.d, phase);
      return {
        minimumDurationMs,
        maximumDurationMs: entry.x === undefined ? minimumDurationMs : at(entry.x, phase),
      };
    }),
  };
}
