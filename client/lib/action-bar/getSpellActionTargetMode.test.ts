import { describe, expect, it } from "vitest";
import { getSpellActionTargetMode } from "./getSpellActionTargetMode";

describe("getSpellActionTargetMode", () => {
  it("repairs legacy target modes from the spell's server catalog kind", () => {
    expect(getSpellActionTargetMode("self", "attack-target")).toBe("self");
    expect(getSpellActionTargetMode("direction", "attack-target")).toBe(
      "direction",
    );
    expect(getSpellActionTargetMode("position", "attack-target")).toBe(
      "crosshair",
    );
  });

  it("keeps explicit cursor and optional direction targeting", () => {
    expect(getSpellActionTargetMode("target", "cursor")).toBe("cursor");
    expect(
      getSpellActionTargetMode("target-or-direction", "direction"),
    ).toBe("direction");
  });
});
