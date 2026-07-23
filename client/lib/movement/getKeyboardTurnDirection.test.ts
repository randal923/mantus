import { describe, expect, it } from "vitest";
import { getKeyboardTurnDirection } from "./getKeyboardTurnDirection";

describe("getKeyboardTurnDirection", () => {
  it.each([
    ["KeyW", "north"],
    ["KeyD", "east"],
    ["KeyS", "south"],
    ["KeyA", "west"],
  ] as const)("maps Alt+%s to %s", (code, direction) => {
    expect(getKeyboardTurnDirection({ altKey: true, code })).toBe(direction);
  });

  it("leaves unmodified movement keys and Alt+arrow keys alone", () => {
    expect(
      getKeyboardTurnDirection({ altKey: false, code: "KeyW" }),
    ).toBeNull();
    expect(
      getKeyboardTurnDirection({ altKey: true, code: "ArrowUp" }),
    ).toBeNull();
  });
});
