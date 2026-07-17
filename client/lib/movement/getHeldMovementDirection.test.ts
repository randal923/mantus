import { describe, expect, it } from "vitest";
import { getHeldMovementDirection } from "./getHeldMovementDirection";

describe("getHeldMovementDirection", () => {
  it("combines held cardinal keys when diagonal walking is enabled", () => {
    expect(getHeldMovementDirection(["KeyW", "KeyD"], true)).toBe(
      "northeast",
    );
  });

  it("uses the latest cardinal key when diagonal walking is disabled", () => {
    expect(getHeldMovementDirection(["KeyW", "KeyD"], false)).toBe("east");
  });

  it("disables direct diagonal keys with the setting", () => {
    expect(getHeldMovementDirection(["Numpad9"], true)).toBe("northeast");
    expect(getHeldMovementDirection(["Numpad9"], false)).toBeNull();
  });
});
