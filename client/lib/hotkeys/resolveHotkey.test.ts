import { describe, expect, it } from "vitest";
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
  it("maps KeyI to toggleInventory", () => {
    expect(resolveHotkey(press("KeyI"))).toBe("toggleInventory");
  });

  it("maps Escape to toggleGameMenu", () => {
    expect(resolveHotkey(press("Escape"))).toBe("toggleGameMenu");
  });

  it("maps KeyC to toggleCharacterStats", () => {
    expect(resolveHotkey(press("KeyC"))).toBe("toggleCharacterStats");
  });

  it("returns null for unbound keys", () => {
    expect(resolveHotkey(press("KeyZ"))).toBeNull();
  });

  it("ignores modifier combos so browser shortcuts keep working", () => {
    expect(resolveHotkey(press("KeyI", { ctrlKey: true }))).toBeNull();
    expect(resolveHotkey(press("KeyI", { altKey: true }))).toBeNull();
    expect(resolveHotkey(press("KeyI", { metaKey: true }))).toBeNull();
    expect(resolveHotkey(press("KeyI", { shiftKey: true }))).toBeNull();
  });

  it("ignores auto-repeat from a held key", () => {
    expect(resolveHotkey(press("KeyI", { repeat: true }))).toBeNull();
  });
});
