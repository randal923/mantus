import { describe, expect, it } from "vitest";
import { marketFeeOf } from "./marketFeeOf";
import { marketTotalOf } from "./marketTotalOf";

describe("marketFeeOf", () => {
  it("charges 2% clamped between 20 and 1,000,000", () => {
    expect(marketFeeOf(1)).toBe(20);
    expect(marketFeeOf(1_000)).toBe(20);
    expect(marketFeeOf(50_000)).toBe(1_000);
    expect(marketFeeOf(123_456)).toBe(2_469);
    expect(marketFeeOf(50_000_000)).toBe(1_000_000);
    expect(marketFeeOf(1_000_000_000_000)).toBe(1_000_000);
  });

  it("is deterministic integer math", () => {
    expect(marketFeeOf(1_049)).toBe(20);
    expect(marketFeeOf(1_051)).toBe(21);
  });
});

describe("marketTotalOf", () => {
  it("returns exact totals inside the cap", () => {
    expect(marketTotalOf(100, 500)).toBe(50_000);
    expect(marketTotalOf(1, 1_000_000_000_000)).toBe(1_000_000_000_000);
  });

  it("rejects totals that would overflow the cap before multiplying", () => {
    expect(marketTotalOf(2, 1_000_000_000_000)).toBeNull();
    expect(marketTotalOf(64_000, 1_000_000_000_000)).toBeNull();
    expect(marketTotalOf(64_000, 15_625_001)).toBeNull();
    expect(marketTotalOf(64_000, 15_625_000)).toBe(1_000_000_000_000);
  });

  it("rejects non-integer and non-positive inputs", () => {
    expect(marketTotalOf(0, 100)).toBeNull();
    expect(marketTotalOf(-5, 100)).toBeNull();
    expect(marketTotalOf(1.5, 100)).toBeNull();
    expect(marketTotalOf(10, 0)).toBeNull();
    expect(marketTotalOf(10, Number.NaN)).toBeNull();
  });
});
