import { describe, expect, it } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "../hotkeys/keyBindings";
import { getMovementKeyDirections } from "./getMovementKeyDirections";

describe("getMovementKeyDirections", () => {
  it("maps default bindings plus built-in arrows and numpad diagonals", () => {
    const directions = getMovementKeyDirections(DEFAULT_KEY_BINDINGS);
    expect(directions.KeyW).toBe("north");
    expect(directions.KeyA).toBe("west");
    expect(directions.ArrowUp).toBe("north");
    expect(directions.Numpad3).toBe("southeast");
  });

  it("lets movement bindings replace the defaults", () => {
    const directions = getMovementKeyDirections({
      ...DEFAULT_KEY_BINDINGS,
      moveUp: "KeyT",
    });
    expect(directions.KeyT).toBe("north");
    expect(directions.KeyW).toBeUndefined();
  });

  it("releases built-in keys bound to another action", () => {
    const directions = getMovementKeyDirections({
      ...DEFAULT_KEY_BINDINGS,
      toggleInventory: "ArrowUp",
    });
    expect(directions.ArrowUp).toBeUndefined();
    expect(directions.ArrowDown).toBe("south");
  });

  it("keeps a built-in key that movement explicitly claims", () => {
    const directions = getMovementKeyDirections({
      ...DEFAULT_KEY_BINDINGS,
      moveUp: "ArrowUp",
    });
    expect(directions.ArrowUp).toBe("north");
  });
});
