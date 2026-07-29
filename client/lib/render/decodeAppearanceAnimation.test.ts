import { describe, expect, it } from "vitest";
import { decodeAppearanceAnimation } from "./decodeAppearanceAnimation";

describe("decodeAppearanceAnimation", () => {
  it("expands a uniform schedule to one duration per phase", () => {
    const animation = decodeAppearanceAnimation({ d: 200, s: 1 }, 3);

    expect(animation.timingMode).toBe("synchronized");
    expect(animation.loopType).toBe("infinite");
    expect(animation.phases).toEqual([
      { minimumDurationMs: 200, maximumDurationMs: 200 },
      { minimumDurationMs: 200, maximumDurationMs: 200 },
      { minimumDurationMs: 200, maximumDurationMs: 200 },
    ]);
  });

  it("keeps a per-phase schedule, its range and its loop", () => {
    const animation = decodeAppearanceAnimation(
      { d: [500, 100, 100], x: [900, 100, 100], l: "counted", c: 1, p: null },
      3,
    );

    expect(animation.timingMode).toBe("asynchronous");
    expect(animation.loopType).toBe("counted");
    expect(animation.loopCount).toBe(1);
    expect(animation.startPhase).toBeNull();
    expect(animation.phases[0]).toEqual({
      minimumDurationMs: 500,
      maximumDurationMs: 900,
    });
    expect(animation.phases[1]).toEqual({
      minimumDurationMs: 100,
      maximumDurationMs: 100,
    });
  });
});
