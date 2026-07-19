import { describe, expect, it } from "vitest";
import { formatSkullRemaining } from "./formatSkullRemaining";

describe("formatSkullRemaining", () => {
  it("formats sub-hour times as m:ss", () => {
    expect(formatSkullRemaining(0)).toBe("0:00");
    expect(formatSkullRemaining(59_000)).toBe("0:59");
    expect(formatSkullRemaining(15 * 60_000)).toBe("15:00");
  });

  it("formats hour-plus times as h:mm:ss", () => {
    expect(formatSkullRemaining(3_600_000)).toBe("1:00:00");
    expect(formatSkullRemaining(24 * 3_600_000 - 1_000)).toBe("23:59:59");
    expect(formatSkullRemaining(3 * 24 * 3_600_000)).toBe("72:00:00");
  });

  it("clamps negative values to zero", () => {
    expect(formatSkullRemaining(-5_000)).toBe("0:00");
  });

  it("rounds partial seconds up", () => {
    expect(formatSkullRemaining(1_200)).toBe("0:02");
  });
});
