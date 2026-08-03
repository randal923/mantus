import { describe, expect, it } from "vitest";
import { NO_STAGES, type StageRow, getStageRate } from "./stageRates";

/** Shaped like a config.yml table: ascending bands, unbounded tail. */
const STAGES: ReadonlyArray<StageRow> = [
  { minLevel: 10, maxLevel: 60, multiplier: 15 },
  { minLevel: 61, maxLevel: 80, multiplier: 10 },
  { minLevel: 81, multiplier: 2 },
];

describe("getStageRate", () => {
  it("resolves bands at their boundaries", () => {
    expect(getStageRate(STAGES, 10, 1)).toBe(15);
    expect(getStageRate(STAGES, 60, 1)).toBe(15);
    expect(getStageRate(STAGES, 61, 1)).toBe(10);
    expect(getStageRate(STAGES, 80, 1)).toBe(10);
    expect(getStageRate(STAGES, 81, 1)).toBe(2);
  });

  it("keeps the last band for every level past it", () => {
    expect(getStageRate(STAGES, 5_000, 1)).toBe(2);
  });

  it("falls back when no band matches the level", () => {
    // This table starts at level 10; below that uses the fallback rate.
    expect(getStageRate(STAGES, 0, 42)).toBe(42);
    expect(getStageRate(STAGES, 9, 42)).toBe(42);
  });

  it("falls back for every level when stages are switched off", () => {
    expect(getStageRate(NO_STAGES.experience, 1, 3)).toBe(3);
    expect(getStageRate(NO_STAGES.skill, 500, 3)).toBe(3);
  });

  it("rejects an out-of-range level", () => {
    expect(() => getStageRate(STAGES, -1, 1)).toThrow();
    expect(() => getStageRate(STAGES, 1.5, 1)).toThrow();
  });
});
