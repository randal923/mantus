import type { ItemAnimationSchedule } from "./getItemAnimationSchedule";
import { ITEM_FRAME_DURATION_MS } from "./ITEM_FRAME_DURATION_MS";

/**
 * The phase a `synchronized` schedule shows at one moment of the shared clock,
 * ported from `Animator::calculateSynchronous`: the phase is a function of the
 * clock alone, so every instance of the appearance is in lockstep no matter when
 * it came into view — the whole ocean ripples together, as it does in Tibia.
 *
 * Lockstep needs a deterministic hold, so the minimum of each phase's window is
 * used; only 14 of Tibia's 1,865 synchronized item schedules declare a range at
 * all. Ping-pong order is honoured here (OTClient's synchronous path walks the
 * phases forward only), which keeps its 123 synchronized ping-pong items — lava
 * walls, christmas garlands — bouncing in step.
 */
export function getSynchronizedItemPhase(
  schedule: ItemAnimationSchedule,
  clockMs: number,
): { phase: number; remainingMs: number } {
  const { playOrder, phaseDurations } = schedule;
  const total = playOrder.reduce(
    (sum, phase) => sum + phaseDurations[phase][0],
    0,
  );
  if (total <= 0) {
    return { phase: playOrder[0] ?? 0, remainingMs: ITEM_FRAME_DURATION_MS };
  }
  const clock = Number.isFinite(clockMs) ? Math.max(0, clockMs) : 0;
  const elapsed = clock % total;
  let boundary = 0;
  for (const phase of playOrder) {
    boundary += phaseDurations[phase][0];
    if (elapsed < boundary) return { phase, remainingMs: boundary - elapsed };
  }
  const last = playOrder[playOrder.length - 1];
  return { phase: last, remainingMs: total - elapsed };
}
