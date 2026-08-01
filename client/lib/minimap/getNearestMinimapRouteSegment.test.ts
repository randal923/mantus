import type { Position } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getNearestMinimapRouteSegment } from "./getNearestMinimapRouteSegment";

const first: readonly [Position, Position] = [
  { x: 33213, y: 32450, z: 7 },
  { x: 33265, y: 32281, z: 7 },
];
const second: readonly [Position, Position] = [
  { x: 32862, y: 32127, z: 7 },
  { x: 32837, y: 32140, z: 7 },
];

describe("getNearestMinimapRouteSegment", () => {
  it("selects the segment nearest the character's current tile", () => {
    expect(
      getNearestMinimapRouteSegment([first, second], {
        x: 32850,
        y: 32134,
        z: 7,
      }),
    ).toBe(second);
  });

  it("returns null when the current floor has no route segment", () => {
    expect(getNearestMinimapRouteSegment([], first[0])).toBeNull();
  });
});
