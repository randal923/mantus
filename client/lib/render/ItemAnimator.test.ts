import { describe, expect, it } from "vitest";
import type { ItemAnimationSchedule } from "./getItemAnimationSchedule";
import { ItemAnimator } from "./ItemAnimator";

function schedule(
  overrides: Partial<ItemAnimationSchedule> = {},
): ItemAnimationSchedule {
  const phaseDurations = overrides.phaseDurations ?? [
    [100, 100],
    [100, 100],
    [100, 100],
  ];
  return {
    phaseDurations,
    playOrder: phaseDurations.map((_, phase) => phase),
    loopType: "infinite",
    loopCount: 0,
    startPhase: 0,
    synchronized: false,
    ...overrides,
  };
}

/** The phases an animator shows over `steps` frames of `deltaMs`. */
function play(animator: ItemAnimator, steps: number, deltaMs = 100): number[] {
  const phases = [animator.phase];
  for (let step = 0; step < steps; step++) {
    animator.advance(deltaMs);
    phases.push(animator.phase);
  }
  return phases;
}

describe("ItemAnimator", () => {
  it("starts at phase zero and advances on the declared window", () => {
    const animator = new ItemAnimator(schedule(), 1);
    expect(animator.phase).toBe(0);
    animator.advance(99);
    expect(animator.phase).toBe(0);
    animator.advance(1);
    expect(animator.phase).toBe(1);
  });

  it("loops forever by default", () => {
    expect(play(new ItemAnimator(schedule(), 7), 6)).toEqual([
      0, 1, 2, 0, 1, 2, 0,
    ]);
  });

  it("bounces a ping-pong schedule without repeating the endpoints", () => {
    const animator = new ItemAnimator(
      schedule({ loopType: "ping-pong", loopCount: -1 }),
      3,
    );
    expect(play(animator, 8)).toEqual([0, 1, 2, 1, 0, 1, 2, 1, 0]);
  });

  it("plays a counted schedule from the start and freezes on its last phase", () => {
    const animator = new ItemAnimator(
      schedule({ loopType: "counted", loopCount: 1 }),
      11,
    );
    expect(play(animator, 5)).toEqual([0, 1, 2, 2, 2, 2]);
    expect(animator.complete).toBe(true);
    expect(animator.remainingMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("runs a counted schedule once per declared loop", () => {
    const animator = new ItemAnimator(
      schedule({ loopType: "counted", loopCount: 2 }),
      13,
    );
    expect(play(animator, 7)).toEqual([0, 1, 2, 0, 1, 2, 2, 2]);
  });

  it("re-rolls each phase inside its window on every pass", () => {
    const animator = new ItemAnimator(
      schedule({
        phaseDurations: [
          [2_000, 5_000],
          [100, 100],
        ],
      }),
      getSeed(),
    );
    const idleHolds: number[] = [];
    let elapsed = 0;
    let previous = animator.phase;
    for (let frame = 0; frame < 4_000; frame++) {
      animator.advance(16);
      elapsed += 16;
      if (animator.phase === previous) continue;
      if (previous === 0) idleHolds.push(elapsed);
      elapsed = 0;
      previous = animator.phase;
    }
    expect(idleHolds.length).toBeGreaterThan(2);
    // Sampled in 16ms frames, and each hold is shortened by the last one's
    // overshoot, so allow one frame either side of Tibia's declared window.
    for (const hold of idleHolds) {
      expect(hold).toBeGreaterThanOrEqual(2_000 - 16);
      expect(hold).toBeLessThanOrEqual(5_000 + 16);
    }
    expect(new Set(idleHolds).size).toBeGreaterThan(1);
  });

  it("replays identically for one instance seed and differs across seeds", () => {
    const first = play(
      new ItemAnimator(schedule({ phaseDurations: [[100, 900], [100, 100]] }), 5),
      40,
      16,
    );
    const same = play(
      new ItemAnimator(schedule({ phaseDurations: [[100, 900], [100, 100]] }), 5),
      40,
      16,
    );
    const other = play(
      new ItemAnimator(schedule({ phaseDurations: [[100, 900], [100, 100]] }), 6),
      40,
      16,
    );
    expect(same).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("carries a stalled frame's overshoot into the next hold", () => {
    const animator = new ItemAnimator(schedule(), 1);
    animator.advance(180);
    expect(animator.phase).toBe(1);
    // 80ms of the second phase is already spent, so 20ms finishes it.
    animator.advance(20);
    expect(animator.phase).toBe(2);
  });

  it("takes a random start phase when the schedule asks for one", () => {
    const phases = new Set(
      Array.from(
        { length: 24 },
        (_, seed) => new ItemAnimator(schedule({ startPhase: null }), seed).phase,
      ),
    );
    expect(phases.size).toBeGreaterThan(1);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(3);
    }
  });
});

/** A fixed, arbitrary instance seed; the point is that it never changes. */
function getSeed(): number {
  return 0x9e37_79b9;
}
