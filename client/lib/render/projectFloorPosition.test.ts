import { describe, expect, it } from "vitest";
import { projectFloorPosition } from "./projectFloorPosition";
import { TILE_SIZE } from "./tileSize";

describe("projectFloorPosition", () => {
  it("projects the same upper-floor tile before and after a stair transition", () => {
    const x = 100 * TILE_SIZE;
    const y = 200 * TILE_SIZE;
    expect(projectFloorPosition(x, y, 7, 6)).toEqual({
      x: x - TILE_SIZE,
      y: y - TILE_SIZE,
    });
    expect(projectFloorPosition(x, y, 6, 6)).toEqual({ x, y });
    expect(projectFloorPosition(x, y, 5, 6)).toEqual({
      x: x + TILE_SIZE,
      y: y + TILE_SIZE,
    });
  });
});
