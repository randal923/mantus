import { describe, expect, it } from "vitest";
import { createRenderTestObject } from "./createRenderTestObject";
import { getItemAnimationPhase } from "./getItemAnimationPhase";

describe("getItemAnimationPhase", () => {
  it("keeps one-phase items on phase zero", () => {
    expect(getItemAnimationPhase({ phases: 1 }, 10_000, 42)).toBe(0);
  });

  it("advances legacy items at exact 500 ms phase boundaries", () => {
    const appearance = { phases: 3 };
    expect(getItemAnimationPhase(appearance, 0, 0)).toBe(0);
    expect(getItemAnimationPhase(appearance, 499, 0)).toBe(0);
    expect(getItemAnimationPhase(appearance, 500, 0)).toBe(1);
    expect(getItemAnimationPhase(appearance, 1_000, 0)).toBe(2);
    expect(getItemAnimationPhase(appearance, 1_500, 0)).toBe(0);
  });

  it("uses stable offsets for asynchronous items", () => {
    const appearance = createRenderTestObject({
      phases: 4,
      animation: {
        source: "legacy",
        timingMode: "asynchronous",
        loopType: "infinite",
        loopCount: 0,
        startPhase: 0,
        phases: Array.from({ length: 4 }, () => ({
          minimumDurationMs: 500,
          maximumDurationMs: 500,
        })),
      },
    });
    expect(getItemAnimationPhase(appearance, 0, 0)).toBe(0);
    expect(getItemAnimationPhase(appearance, 0, 1)).toBe(1);
    expect(getItemAnimationPhase(appearance, 0, 1)).toBe(1);
    expect(getItemAnimationPhase(appearance, 500, 1)).toBe(2);
  });

  it("ignores instance seeds for synchronized animations", () => {
    const appearance = createRenderTestObject({
      phases: 2,
      animation: {
        source: "enhanced",
        timingMode: "synchronized",
        loopType: "infinite",
        loopCount: 0,
        startPhase: 0,
        phases: [
          { minimumDurationMs: 100, maximumDurationMs: 100 },
          { minimumDurationMs: 200, maximumDurationMs: 200 },
        ],
      },
    });
    expect(getItemAnimationPhase(appearance, 99, 1)).toBe(0);
    expect(getItemAnimationPhase(appearance, 100, 1)).toBe(1);
    expect(getItemAnimationPhase(appearance, 100, 999)).toBe(1);
    expect(getItemAnimationPhase(appearance, 300, 999)).toBe(0);
  });

  it("supports enhanced counted and ping-pong loops", () => {
    const phases = Array.from({ length: 3 }, () => ({
      minimumDurationMs: 100,
      maximumDurationMs: 100,
    }));
    const counted = createRenderTestObject({
      phases: 3,
      animation: {
        source: "enhanced",
        timingMode: "synchronized",
        loopType: "counted",
        loopCount: 1,
        startPhase: 0,
        phases,
      },
    });
    const pingPong = createRenderTestObject({
      phases: 3,
      animation: {
        source: "enhanced",
        timingMode: "synchronized",
        loopType: "ping-pong",
        loopCount: -1,
        startPhase: 0,
        phases,
      },
    });
    expect(getItemAnimationPhase(counted, 10_000, 0)).toBe(2);
    expect([0, 1, 2, 1, 0].map((_, index) =>
      getItemAnimationPhase(pingPong, index * 100, 0),
    )).toEqual([0, 1, 2, 1, 0]);
  });
});
