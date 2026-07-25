import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_STAGES,
  MAGIC_STAGES,
  SKILL_STAGES,
  getStageRate,
} from "./stageRates";

describe("getStageRate", () => {
  it("resolves experience bands at their boundaries", () => {
    expect(getStageRate(EXPERIENCE_STAGES, 1, 1)).toBe(7);
    expect(getStageRate(EXPERIENCE_STAGES, 8, 1)).toBe(7);
    expect(getStageRate(EXPERIENCE_STAGES, 9, 1)).toBe(6);
    expect(getStageRate(EXPERIENCE_STAGES, 50, 1)).toBe(5);
    expect(getStageRate(EXPERIENCE_STAGES, 101, 1)).toBe(2);
    expect(getStageRate(EXPERIENCE_STAGES, 5_000, 1)).toBe(2);
  });

  it("resolves skill and magic bands", () => {
    expect(getStageRate(SKILL_STAGES, 10, 1)).toBe(15);
    expect(getStageRate(SKILL_STAGES, 60, 1)).toBe(15);
    expect(getStageRate(SKILL_STAGES, 61, 1)).toBe(10);
    expect(getStageRate(SKILL_STAGES, 126, 1)).toBe(2);
    expect(getStageRate(MAGIC_STAGES, 0, 1)).toBe(10);
    expect(getStageRate(MAGIC_STAGES, 100, 1)).toBe(5);
    expect(getStageRate(MAGIC_STAGES, 111, 1)).toBe(3);
  });

  it("falls back when no band matches the level", () => {
    // Skill stages start at level 10; below that uses the fallback rate.
    expect(getStageRate(SKILL_STAGES, 0, 42)).toBe(42);
  });
});
