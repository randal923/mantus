import { describe, expect, it } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "../hotkeys/keyBindings";
import { getHeldMovementDirection } from "./getHeldMovementDirection";
import { getMovementKeyDirections } from "./getMovementKeyDirections";

const DIRECTIONS = getMovementKeyDirections(DEFAULT_KEY_BINDINGS);

describe("getHeldMovementDirection", () => {
  it("combines held cardinal keys when diagonal walking is enabled", () => {
    expect(getHeldMovementDirection(["KeyW", "KeyD"], true, DIRECTIONS)).toBe(
      "northeast",
    );
  });

  it("uses the latest cardinal key when diagonal walking is disabled", () => {
    expect(getHeldMovementDirection(["KeyW", "KeyD"], false, DIRECTIONS)).toBe(
      "east",
    );
  });

  it("disables direct diagonal keys with the setting", () => {
    expect(getHeldMovementDirection(["Numpad9"], true, DIRECTIONS)).toBe(
      "northeast",
    );
    expect(getHeldMovementDirection(["Numpad9"], false, DIRECTIONS)).toBeNull();
  });

  it("follows rebound movement keys", () => {
    const directions = getMovementKeyDirections({
      ...DEFAULT_KEY_BINDINGS,
      moveUp: "KeyT",
      moveRight: "KeyH",
    });
    expect(getHeldMovementDirection(["KeyT", "KeyH"], true, directions)).toBe(
      "northeast",
    );
    expect(getHeldMovementDirection(["KeyW"], true, directions)).toBeNull();
  });
});
