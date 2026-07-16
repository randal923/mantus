import { describe, expect, it } from "vitest";
import { PROTOCOL_LIMITS } from "@tibia/protocol";
import { getAutoWalkDirections } from "./getAutoWalkDirections";

describe("getAutoWalkDirections", () => {
  it("builds a diagonal-first bounded path without authoring outcomes", () => {
    expect(
      getAutoWalkDirections(
        { x: 10, y: 10, z: 7 },
        { x: 13, y: 8, z: 7 },
      ),
    ).toEqual(["northeast", "northeast", "east"]);
  });

  it("rejects floor changes and caps oversized paths", () => {
    expect(
      getAutoWalkDirections(
        { x: 10, y: 10, z: 7 },
        { x: 10, y: 10, z: 6 },
      ),
    ).toEqual([]);
    expect(
      getAutoWalkDirections(
        { x: 0, y: 0, z: 7 },
        { x: 1_000, y: 0, z: 7 },
      ),
    ).toHaveLength(PROTOCOL_LIMITS.maxAutoWalkSteps);
  });
});
