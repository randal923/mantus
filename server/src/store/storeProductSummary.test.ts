import { STORE_LIMITS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { storeProductSummary } from "./storeProductSummary";

describe("storeProductSummary", () => {
  it("takes the first prose line and skips tag-only lines", () => {
    expect(
      storeProductSummary(
        "{character}\n{storeinbox}\nA ferocious cabinet. It opens as a container.\n{info} usable once",
      ),
    ).toBe("A ferocious cabinet. It opens as a container.");
  });

  it("keeps a tagged line's own text out of the summary", () => {
    expect(storeProductSummary("{info} added directly to Prey dialog")).toBe(
      "{info} added directly to Prey dialog",
    );
  });

  it("is empty when the description has no prose", () => {
    expect(storeProductSummary("{house}\n{box}\n{storeinbox}")).toBe("");
    expect(storeProductSummary("")).toBe("");
  });

  it("cuts an overlong line at a word boundary within the limit", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const summary = storeProductSummary(words);
    expect(summary.length).toBeLessThanOrEqual(STORE_LIMITS.maxSummaryLength);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.slice(0, -1).trimEnd()).toMatch(/word\d+$/);
  });
});
