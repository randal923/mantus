import { describe, expect, it } from "vitest";
import { getMapObjectZ } from "./getMapObjectZ";
import { getMapSpritePosition } from "./getMapSpritePosition";
import { MAP_DEPTH } from "./mapDepth";
import { TILE_SIZE } from "./tileSize";

describe("getMapSpritePosition", () => {
  it("draws a northwest spill piece at the covered tile but sorts it at the anchor", () => {
    const spillPiece = getMapSpritePosition(
      10,
      10,
      1,
      1,
      0,
      0,
      0,
      MAP_DEPTH.item,
    );

    expect(spillPiece.x).toBe(9 * TILE_SIZE);
    expect(spillPiece.y).toBe(9 * TILE_SIZE);
    expect(spillPiece.zIndex).toBe(getMapObjectZ(10, 10, MAP_DEPTH.item));
  });

  it("lets a tall item cover creatures and top items on the tiles it spills into", () => {
    const canopyPiece = getMapSpritePosition(
      10,
      10,
      1,
      1,
      0,
      0,
      0,
      MAP_DEPTH.item,
    );
    const coveredCreature = getMapObjectZ(9, 9, MAP_DEPTH.creature);
    const coveredTopItem = getMapObjectZ(9, 9, MAP_DEPTH.onTop);
    const ownTileCreature = getMapObjectZ(10, 10, MAP_DEPTH.creature);

    expect(canopyPiece.zIndex).toBeGreaterThan(coveredCreature);
    expect(canopyPiece.zIndex).toBeGreaterThan(coveredTopItem);
    expect(canopyPiece.zIndex).toBeLessThan(ownTileCreature);
  });

  it("applies displacement and accumulated elevation to every piece", () => {
    expect(getMapSpritePosition(10, 10, 0, 0, 3, 5, 16, 384)).toMatchObject({
      x: 10 * TILE_SIZE - 19,
      y: 10 * TILE_SIZE - 21,
    });
  });
});
