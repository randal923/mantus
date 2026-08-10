import { describe, expect, it } from "vitest";
import { serializeKeyBindingEvent } from "./serializeKeyBindingEvent";

function press(code: string, overrides: Record<string, boolean> = {}) {
  return {
    code,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("serializeKeyBindingEvent", () => {
  it("serializes a bare key to its code", () => {
    expect(serializeKeyBindingEvent(press("KeyI"))).toBe("KeyI");
  });

  it("prefixes modifiers in a fixed order", () => {
    expect(
      serializeKeyBindingEvent(
        press("KeyZ", { ctrlKey: true, shiftKey: true, altKey: true }),
      ),
    ).toBe("Alt+Control+Shift+KeyZ");
  });

  it("returns null for a bare modifier press", () => {
    for (const code of [
      "AltLeft",
      "AltRight",
      "ControlLeft",
      "MetaRight",
      "ShiftLeft",
    ]) {
      expect(serializeKeyBindingEvent(press(code, { shiftKey: true }))).toBe(
        null,
      );
    }
  });
});
