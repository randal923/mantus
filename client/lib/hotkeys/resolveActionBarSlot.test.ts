import { describe, expect, it } from "vitest";
import { resolveActionBarSlot } from "./resolveActionBarSlot";

function press(digit: number, shiftKey = false) {
  return {
    code: `Digit${digit}`,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey,
    repeat: false,
  };
}

describe("resolveActionBarSlot", () => {
  it("maps unmodified digits to spell slots", () => {
    expect(resolveActionBarSlot(press(1))).toBe(0);
    expect(resolveActionBarSlot(press(9))).toBe(8);
  });

  it("maps Shift-digits to potion slots", () => {
    expect(resolveActionBarSlot(press(1, true), "shift")).toBe(0);
    expect(resolveActionBarSlot(press(9, true), "shift")).toBe(8);
  });

  it("keeps the two action-bar modifier sets separate", () => {
    expect(resolveActionBarSlot(press(1, true))).toBeNull();
    expect(resolveActionBarSlot(press(1), "shift")).toBeNull();
  });
});
