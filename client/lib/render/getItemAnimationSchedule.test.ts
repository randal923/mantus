import { describe, expect, it } from "vitest";
import { createRenderTestObject } from "./createRenderTestObject";
import { getItemAnimationSchedule } from "./getItemAnimationSchedule";
import { ITEM_FRAME_DURATION_MS } from "./ITEM_FRAME_DURATION_MS";

function animation(
  durations: ReadonlyArray<readonly [number, number]>,
  overrides: Partial<
    Pick<
      NonNullable<ReturnType<typeof createRenderTestObject>["animation"]>,
      "loopType" | "loopCount" | "startPhase" | "timingMode"
    >
  > = {},
) {
  return createRenderTestObject({
    phases: durations.length,
    animation: {
      source: "appearances",
      timingMode: "asynchronous",
      loopType: "infinite",
      loopCount: 0,
      startPhase: 0,
      ...overrides,
      phases: durations.map(([minimum, maximum]) => ({
        minimumDurationMs: minimum,
        maximumDurationMs: maximum,
      })),
    },
  });
}

describe("getItemAnimationSchedule", () => {
  it("refuses objects that cannot animate", () => {
    expect(getItemAnimationSchedule({ phases: 1 })).toBeNull();
    expect(getItemAnimationSchedule({ phases: 0 })).toBeNull();
  });

  it("falls back to Tibia's item frame rate with no schedule", () => {
    const schedule = getItemAnimationSchedule({ phases: 3 });
    expect(schedule?.phaseDurations).toEqual([
      [ITEM_FRAME_DURATION_MS, ITEM_FRAME_DURATION_MS],
      [ITEM_FRAME_DURATION_MS, ITEM_FRAME_DURATION_MS],
      [ITEM_FRAME_DURATION_MS, ITEM_FRAME_DURATION_MS],
    ]);
  });

  it("replaces 0ms phases with the first real window instead of strobing", () => {
    // `star blossom` 38290 declares [0, 200, 200, 200, 200, 200].
    const leadingZero = getItemAnimationSchedule(
      animation([
        [0, 0],
        [200, 200],
        [200, 200],
      ]),
    );
    expect(leadingZero?.phaseDurations[0]).toEqual([200, 200]);

    // `vortex` 22894 declares 0ms for every one of its phases.
    const allZero = getItemAnimationSchedule(
      animation([
        [0, 0],
        [0, 0],
      ]),
    );
    expect(allZero?.phaseDurations).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it("keeps a partially declared window as Tibia wrote it", () => {
    const schedule = getItemAnimationSchedule(
      animation([
        [0, 800],
        [100, 100],
      ]),
    );
    expect(schedule?.phaseDurations[0]).toEqual([0, 800]);
  });

  it("expands ping-pong into the order it plays", () => {
    const schedule = getItemAnimationSchedule(
      animation(
        [
          [100, 100],
          [100, 100],
          [100, 100],
        ],
        { loopType: "ping-pong", loopCount: -1 },
      ),
    );
    expect(schedule?.playOrder).toEqual([0, 1, 2, 1]);
  });

  it("never shares a clock for a counted schedule", () => {
    const schedule = getItemAnimationSchedule(
      animation([[500, 500]], {
        timingMode: "synchronized",
        loopType: "counted",
        loopCount: 1,
      }),
    );
    expect(schedule).toBeNull();

    const counted = getItemAnimationSchedule(
      animation(
        [
          [500, 500],
          [500, 500],
        ],
        { timingMode: "synchronized", loopType: "counted", loopCount: 1 },
      ),
    );
    expect(counted?.synchronized).toBe(false);
    expect(counted?.loopCount).toBe(1);
  });

  it("keeps a request for a random start phase", () => {
    const schedule = getItemAnimationSchedule(
      animation(
        [
          [100, 100],
          [100, 100],
        ],
        { startPhase: null },
      ),
    );
    expect(schedule?.startPhase).toBeNull();
  });

  it("shares one clock for synchronized schedules", () => {
    const schedule = getItemAnimationSchedule(
      animation(
        [
          [200, 200],
          [200, 200],
        ],
        { timingMode: "synchronized" },
      ),
    );
    expect(schedule?.synchronized).toBe(true);
  });
});
