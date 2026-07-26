import { describe, expect, it } from "vitest";
import { bossRewardRollCount } from "./bossRewardRollCount";

describe("bossRewardRollCount", () => {
  it("adds whole bonus rolls directly", () => {
    expect(bossRewardRollCount(0, () => true)).toBe(1);
    expect(bossRewardRollCount(100, () => false)).toBe(2);
  });

  it("resolves the fractional part probabilistically (boosted +250%)", () => {
    const passed: number[] = [];
    expect(
      bossRewardRollCount(250, (percent) => {
        passed.push(percent);
        return true;
      }),
    ).toBe(4);
    expect(passed).toEqual([50]);
    expect(bossRewardRollCount(250, () => false)).toBe(3);
  });

  it("never rolls below one", () => {
    expect(bossRewardRollCount(-50, () => true)).toBe(1);
  });
});
