import { describe, expect, it } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "./keyBindings";
import { resolveHotkey } from "./resolveHotkey";

function press(code: string, overrides: Record<string, boolean> = {}) {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("resolveHotkey", () => {
  it("maps default bindings to their actions", () => {
    expect(resolveHotkey(press("KeyI"), DEFAULT_KEY_BINDINGS)).toBe(
      "toggleInventory",
    );
    expect(resolveHotkey(press("KeyC"), DEFAULT_KEY_BINDINGS)).toBe(
      "toggleCharacterStats",
    );
    expect(resolveHotkey(press("Escape"), DEFAULT_KEY_BINDINGS)).toBe(
      "toggleGameMenu",
    );
  });

  it("returns null for unbound keys", () => {
    expect(resolveHotkey(press("KeyZ"), DEFAULT_KEY_BINDINGS)).toBeNull();
  });

  it("never resolves movement bindings as one-shot actions", () => {
    expect(resolveHotkey(press("KeyW"), DEFAULT_KEY_BINDINGS)).toBeNull();
    expect(resolveHotkey(press("KeyA"), DEFAULT_KEY_BINDINGS)).toBeNull();
  });

  it("ignores modifier combos that are not bound", () => {
    expect(
      resolveHotkey(press("KeyI", { ctrlKey: true }), DEFAULT_KEY_BINDINGS),
    ).toBeNull();
    expect(
      resolveHotkey(press("KeyI", { shiftKey: true }), DEFAULT_KEY_BINDINGS),
    ).toBeNull();
  });

  it("ignores auto-repeat from a held key", () => {
    expect(
      resolveHotkey(press("KeyI", { repeat: true }), DEFAULT_KEY_BINDINGS),
    ).toBeNull();
  });

  it("maps Ctrl+Z to openBugReport", () => {
    expect(
      resolveHotkey(press("KeyZ", { ctrlKey: true }), DEFAULT_KEY_BINDINGS),
    ).toBe("openBugReport");
  });

  it("ignores Ctrl+Z combined with further modifiers", () => {
    expect(
      resolveHotkey(
        press("KeyZ", { ctrlKey: true, shiftKey: true }),
        DEFAULT_KEY_BINDINGS,
      ),
    ).toBeNull();
  });

  it("honors rebound keys, including modifier combos", () => {
    const bindings = {
      ...DEFAULT_KEY_BINDINGS,
      toggleInventory: "KeyB",
      toggleQuestLog: "Shift+KeyQ",
    };
    expect(resolveHotkey(press("KeyI"), bindings)).toBeNull();
    expect(resolveHotkey(press("KeyB"), bindings)).toBe("toggleInventory");
    expect(resolveHotkey(press("KeyQ", { shiftKey: true }), bindings)).toBe(
      "toggleQuestLog",
    );
  });

  it("returns null for cleared bindings", () => {
    const bindings = { ...DEFAULT_KEY_BINDINGS, toggleInventory: null };
    expect(resolveHotkey(press("KeyI"), bindings)).toBeNull();
  });
});
