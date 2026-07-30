import { describe, expect, it } from "vitest";
import type { ItemAnimationSchedule } from "./getItemAnimationSchedule";
import { getSynchronizedItemPhase } from "./getSynchronizedItemPhase";

const water: ItemAnimationSchedule = {
  phaseDurations: [
    [200, 200],
    [200, 200],
    [200, 200],
    [200, 200],
  ],
  playOrder: [0, 1, 2, 3],
  loopType: "infinite",
  loopCount: 0,
  startPhase: 0,
  synchronized: true,
};

describe("getSynchronizedItemPhase", () => {
  it("is a function of the clock alone, so instances stay in lockstep", () => {
    expect(getSynchronizedItemPhase(water, 0).phase).toBe(0);
    expect(getSynchronizedItemPhase(water, 199).phase).toBe(0);
    expect(getSynchronizedItemPhase(water, 200).phase).toBe(1);
    expect(getSynchronizedItemPhase(water, 999).phase).toBe(0);
    // One clock, one answer: a tile drawn a minute later shows the same phase.
    expect(getSynchronizedItemPhase(water, 60_200).phase).toBe(
      getSynchronizedItemPhase(water, 200).phase,
    );
  });

  it("reports the time left in the phase so callers can sleep", () => {
    expect(getSynchronizedItemPhase(water, 250).remainingMs).toBe(150);
    expect(getSynchronizedItemPhase(water, 800).remainingMs).toBe(200);
  });

  it("follows ping-pong order in lockstep", () => {
    const lavaWall: ItemAnimationSchedule = {
      ...water,
      phaseDurations: [
        [200, 200],
        [200, 200],
        [200, 200],
      ],
      playOrder: [0, 1, 2, 1],
      loopType: "ping-pong",
    };
    expect(
      [0, 200, 400, 600, 800, 1_000].map(
        (clock) => getSynchronizedItemPhase(lavaWall, clock).phase,
      ),
    ).toEqual([0, 1, 2, 1, 0, 1]);
  });

  it("never divides by a zero-length cycle", () => {
    const empty: ItemAnimationSchedule = {
      ...water,
      phaseDurations: [
        [0, 800],
        [0, 800],
      ],
      playOrder: [0, 1],
    };
    expect(getSynchronizedItemPhase(empty, 1_234).phase).toBe(0);
    expect(getSynchronizedItemPhase(empty, 1_234).remainingMs).toBeGreaterThan(0);
  });
});
