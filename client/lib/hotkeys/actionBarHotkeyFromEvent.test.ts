import { describe, expect, it } from "vitest";
import { actionBarHotkeyFromEvent } from "./actionBarHotkeyFromEvent";
import { matchesActionBarHotkey } from "./matchesActionBarHotkey";

function press(
  code: string,
  modifiers: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }> = {},
) {
  return {
    code,
    altKey: modifiers.altKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
  };
}

describe("actionBarHotkeyFromEvent", () => {
  it("normalizes arbitrary key and modifier combinations", () => {
    expect(actionBarHotkeyFromEvent(press("Digit1"))).toBe("Digit1");
    expect(
      actionBarHotkeyFromEvent(
        press("KeyQ", { ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("Control+Shift+KeyQ");
  });

  it("keeps chat, movement, navigation, and bare modifiers reserved", () => {
    expect(actionBarHotkeyFromEvent(press("Enter"))).toBeNull();
    expect(actionBarHotkeyFromEvent(press("KeyW"))).toBeNull();
    expect(
      actionBarHotkeyFromEvent(press("ShiftLeft", { shiftKey: true })),
    ).toBeNull();
  });

  it("allows a modified movement key and matches only the exact chord", () => {
    const event = press("KeyW", { altKey: true });
    expect(actionBarHotkeyFromEvent(event)).toBe("Alt+KeyW");
    expect(matchesActionBarHotkey(event, "Alt+KeyW")).toBe(true);
    expect(matchesActionBarHotkey(event, "Control+KeyW")).toBe(false);
  });
});
