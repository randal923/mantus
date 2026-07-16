import { describe, expect, it } from "vitest";
import { getMapObjectZ } from "./getMapObjectZ";
import { getMapSpritePosition } from "./getMapSpritePosition";
import { MAP_DEPTH } from "./mapDepth";
import { TILE_SIZE } from "./tileSize";

describe("getMapSpritePosition", () => {
  it("sorts a large northwest piece against the tile it spills into", () => {
    const commonPiece = getMapSpritePosition(
      10,
      10,
      1,
      1,
      0,
      0,
      0,
      MAP_DEPTH.item,
    );
    const canopyPiece = getMapSpritePosition(
      10,
      10,
      1,
      1,
      0,
      0,
      0,
      MAP_DEPTH.onTop,
    );
    const creatureDepth = getMapObjectZ(9, 9, MAP_DEPTH.creature);

    expect(commonPiece).toEqual({
      x: 9 * TILE_SIZE,
      y: 9 * TILE_SIZE,
      zIndex: getMapObjectZ(9, 9, MAP_DEPTH.item),
    });
    expect(commonPiece.zIndex).toBeLessThan(creatureDepth);
    expect(canopyPiece.zIndex).toBeGreaterThan(creatureDepth);
  });

  it("applies displacement and accumulated elevation to every piece", () => {
    expect(getMapSpritePosition(10, 10, 0, 0, 3, 5, 16, 384)).toMatchObject({
      x: 10 * TILE_SIZE - 19,
      y: 10 * TILE_SIZE - 21,
    });
  });
});
