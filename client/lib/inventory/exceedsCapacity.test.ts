import { describe, expect, it } from "vitest";
import { exceedsCapacity } from "./exceedsCapacity";

describe("exceedsCapacity", () => {
  it("rejects weight that cannot fit even at the lowest real usage", () => {
    expect(
      exceedsCapacity({ capacityUsed: 90, capacityMax: 100 }, 1_100),
    ).toBe(true);
  });

  it("allows weight that may fit because usage is rounded up", () => {
    expect(
      exceedsCapacity({ capacityUsed: 90, capacityMax: 100 }, 1_099),
    ).toBe(false);
  });

  it("uses the full budget when nothing is carried", () => {
    expect(exceedsCapacity({ capacityUsed: 0, capacityMax: 10 }, 1_000)).toBe(
      false,
    );
    expect(exceedsCapacity({ capacityUsed: 0, capacityMax: 10 }, 1_001)).toBe(
      true,
    );
  });
});
