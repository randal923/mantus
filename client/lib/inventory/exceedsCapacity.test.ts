import { describe, expect, it } from "vitest";
import { exceedsCapacity } from "./exceedsCapacity";

describe("exceedsCapacity", () => {
  it("rejects weight that goes over the remaining budget", () => {
    expect(
      exceedsCapacity({ usedWeight: 8_950, capacityMax: 100 }, 1_051),
    ).toBe(true);
  });

  it("allows weight that exactly fills the remaining budget", () => {
    expect(
      exceedsCapacity({ usedWeight: 8_950, capacityMax: 100 }, 1_050),
    ).toBe(false);
  });

  it("uses the full budget when nothing is carried", () => {
    expect(exceedsCapacity({ usedWeight: 0, capacityMax: 10 }, 1_000)).toBe(
      false,
    );
    expect(exceedsCapacity({ usedWeight: 0, capacityMax: 10 }, 1_001)).toBe(
      true,
    );
  });
});
