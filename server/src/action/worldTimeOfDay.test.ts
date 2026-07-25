import { describe, expect, it } from "vitest";
import { worldTimeOfDay } from "./worldTimeOfDay";

describe("worldTimeOfDay", () => {
  it("runs one Tibian day per real hour", () => {
    expect(worldTimeOfDay(0)).toBe("0:00");
    // Half a real hour in is Tibian noon.
    expect(worldTimeOfDay(30 * 60 * 1_000)).toBe("12:00");
    // The last step before the hour rolls over.
    expect(worldTimeOfDay(3_590 * 1_000)).toBe("23:56");
    expect(worldTimeOfDay(3_600 * 1_000)).toBe("0:00");
  });

  it("advances in Canary's four-light-minute steps", () => {
    expect(worldTimeOfDay(9_999)).toBe("0:00");
    expect(worldTimeOfDay(10_000)).toBe("0:04");
    expect(worldTimeOfDay(19_999)).toBe("0:04");
    expect(worldTimeOfDay(20_000)).toBe("0:08");
  });

  it("zero-pads the minutes", () => {
    expect(worldTimeOfDay(150 * 1_000)).toBe("1:00");
    expect(worldTimeOfDay(160 * 1_000)).toBe("1:04");
  });
});
