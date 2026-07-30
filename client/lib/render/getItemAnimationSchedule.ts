import type { TibiaAnimation } from "./AssetStore";
import { ITEM_FRAME_DURATION_MS } from "./ITEM_FRAME_DURATION_MS";

export interface ItemAnimationSchedule {
  /** `[min, max]` hold time per phase; Tibia re-rolls inside the range. */
  readonly phaseDurations: ReadonlyArray<readonly [number, number]>;
  /** The phase order one pass plays — bounced back again for ping-pong. */
  readonly playOrder: ReadonlyArray<number>;
  readonly loopType: TibiaAnimation["loopType"];
  readonly loopCount: number;
  /** null asks for a per-instance random start phase. */
  readonly startPhase: number | null;
  /**
   * Every instance animates on one shared clock. Counted schedules are never
   * treated as shared: a loop count only means something counted from the
   * moment the item appeared.
   */
  readonly synchronized: boolean;
}

interface AnimatedAppearance {
  readonly phases: number;
  readonly animation?: TibiaAnimation | null;
}

/**
 * Appearances are shared instances out of `AssetStore`, and a screen of water
 * asks for the same schedule hundreds of times per redraw.
 */
const cache = new WeakMap<object, ItemAnimationSchedule | null>();

/**
 * The animation schedule for one appearance, or null when it cannot animate.
 *
 * Mirrors `Animator::unserializeAppearance` in OTClient: phases Tibia gives a
 * 0ms window take the first non-zero window instead (a 0ms hold would cycle the
 * object as fast as the display refreshes — `vortex` 22894 declares 0ms for all
 * 15 of its phases), falling back to 1ms when every phase is zero.
 */
export function getItemAnimationSchedule(
  appearance: AnimatedAppearance,
): ItemAnimationSchedule | null {
  const cached = cache.get(appearance);
  if (cached !== undefined) return cached;
  const schedule = buildSchedule(appearance);
  cache.set(appearance, schedule);
  return schedule;
}

function buildSchedule(
  appearance: AnimatedAppearance,
): ItemAnimationSchedule | null {
  const phaseCount = Math.max(0, Math.floor(appearance.phases));
  if (phaseCount < 2) return null;

  const animation = appearance.animation ?? null;
  const declared = Array.from({ length: phaseCount }, (_, phase) => {
    const metadata = animation?.phases[phase];
    const minimum = Math.max(
      0,
      Math.floor(metadata?.minimumDurationMs ?? ITEM_FRAME_DURATION_MS),
    );
    const maximum = Math.max(
      minimum,
      Math.floor(metadata?.maximumDurationMs ?? minimum),
    );
    return [minimum, maximum] as const;
  });
  const substitute =
    declared.find(([minimum, maximum]) => minimum > 0 || maximum > 0) ??
    ([1, 1] as const);
  const phaseDurations = declared.map(([minimum, maximum]) =>
    minimum === 0 && maximum === 0 ? substitute : ([minimum, maximum] as const),
  );

  const loopType = animation?.loopType ?? "infinite";
  const playOrder = Array.from({ length: phaseCount }, (_, phase) => phase);
  if (loopType === "ping-pong" && phaseCount > 2) {
    for (let phase = phaseCount - 2; phase > 0; phase--) playOrder.push(phase);
  }

  // `startPhase` is nullable in its own right — null asks for a random start —
  // so it must not be coalesced away.
  const startPhase = animation ? animation.startPhase : 0;
  return {
    phaseDurations,
    playOrder,
    loopType,
    loopCount: loopType === "counted" ? Math.max(1, animation?.loopCount ?? 1) : 0,
    startPhase:
      startPhase === null ? null : Math.min(phaseCount - 1, Math.max(0, startPhase)),
    synchronized:
      animation?.timingMode === "synchronized" && loopType !== "counted",
  };
}
