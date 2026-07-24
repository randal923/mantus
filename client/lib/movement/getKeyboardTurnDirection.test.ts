import { describe, expect, it } from "vitest";
import type { TurnModifier } from "@tibia/protocol";
import { getKeyboardTurnDirection } from "./getKeyboardTurnDirection";

function press(
  code: string,
  modifier: TurnModifier | null = null,
): Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
> {
  return {
    code,
    altKey: modifier === "Alt",
    ctrlKey: modifier === "Control",
    metaKey: modifier === "Meta",
    shiftKey: modifier === "Shift",
  };
}

describe("getKeyboardTurnDirection", () => {
  it.each([
    ["KeyW", "north"],
    ["KeyD", "east"],
    ["KeyS", "south"],
    ["KeyA", "west"],
  ] as const)("maps Shift+%s to %s", (code, direction) => {
    expect(getKeyboardTurnDirection(press(code, "Shift"))).toBe(direction);
  });

  it("leaves unmodified movement keys and Shift+arrow keys alone", () => {
    expect(getKeyboardTurnDirection(press("KeyW"))).toBeNull();
    expect(getKeyboardTurnDirection(press("ArrowUp", "Shift"))).toBeNull();
  });

  it.each(["Alt", "Control", "Meta", "Shift"] as const)(
    "uses a configured %s modifier",
    (modifier) => {
      expect(getKeyboardTurnDirection(press("KeyW", modifier), modifier)).toBe(
        "north",
      );
    },
  );

  it("does not turn for a different modifier than the configured one", () => {
    expect(
      getKeyboardTurnDirection(press("KeyW", "Shift"), "Alt"),
    ).toBeNull();
  });
});
