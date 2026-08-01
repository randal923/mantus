import { describe, expect, it } from "vitest";
import { parseHuntMetric } from "./parseHuntMetric";

describe("parseHuntMetric", () => {
  it("parses the K and KK notation used by the guide catalog", () => {
    expect(parseHuntMetric("80K")).toBe(80_000);
    expect(parseHuntMetric("2.5KK")).toBe(2_500_000);
  });

  it("applies a range suffix to both endpoints", () => {
    expect(parseHuntMetric("5 - 50K")).toBe(27_500);
    expect(parseHuntMetric("2 - 5KK")).toBe(3_500_000);
  });

  it("returns zero for a metric without a number", () => {
    expect(parseHuntMetric("Unknown")).toBe(0);
  });
});
