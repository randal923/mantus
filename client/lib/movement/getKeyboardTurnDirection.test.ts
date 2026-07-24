import { describe, expect, it } from "vitest";
import { getKeyboardTurnDirection } from "./getKeyboardTurnDirection";

describe("getKeyboardTurnDirection", () => {
  it.each([
    ["KeyW", "north"],
    ["KeyD", "east"],
    ["KeyS", "south"],
    ["KeyA", "west"],
  ] as const)("maps Shift+%s to %s", (code, direction) => {
    expect(getKeyboardTurnDirection({ shiftKey: true, code })).toBe(direction);
  });

  it("leaves unmodified movement keys and Shift+arrow keys alone", () => {
    expect(
      getKeyboardTurnDirection({ shiftKey: false, code: "KeyW" }),
    ).toBeNull();
    expect(
      getKeyboardTurnDirection({ shiftKey: true, code: "ArrowUp" }),
    ).toBeNull();
  });
});
