import { describe, expect, it } from "vitest";
import type { AssetStore } from "./AssetStore";
import { createRenderTestObject } from "./createRenderTestObject";
import { getItemIconPieces } from "./getItemIconPieces";
import { getSpriteIndex } from "./getSpriteIndex";

/** Only `spriteId` is needed here, and it is the real index arithmetic. */
function fakeStore(): AssetStore {
  return {
    spriteId: (object, pattern) => object.sprites[getSpriteIndex(object, pattern)] ?? 0,
  } as AssetStore;
}

describe("getItemIconPieces", () => {
  it("draws a one-tile item's current phase", () => {
    const potion = createRenderTestObject({
      phases: 3,
      sprites: [11, 12, 13],
    });
    expect(getItemIconPieces(fakeStore(), potion, 2, 1)).toEqual({
      columns: 1,
      rows: 1,
      pieces: [{ spriteId: 13, column: 0, row: 0 }],
    });
  });

  it("draws every piece of a multi-tile item, bottom-right anchored", () => {
    const clock = createRenderTestObject({
      width: 2,
      height: 2,
      sprites: [1, 2, 3, 4],
    });
    expect(getItemIconPieces(fakeStore(), clock, 0, 1)).toEqual({
      columns: 2,
      rows: 2,
      pieces: [
        { spriteId: 1, column: 1, row: 1 },
        { spriteId: 2, column: 0, row: 1 },
        { spriteId: 3, column: 1, row: 0 },
        { spriteId: 4, column: 0, row: 0 },
      ],
    });
  });

  it("picks the pile art for a stack, and animates it", () => {
    // A 4×2 pattern grid over two phases: pattern cell (x, y), then phase.
    const gems = createRenderTestObject({
      px: 4,
      py: 2,
      phases: 2,
      flags: { stackable: true },
      sprites: Array.from({ length: 16 }, (_, index) => index + 1),
    });
    const single = getItemIconPieces(fakeStore(), gems, 0, 1);
    const pile = getItemIconPieces(fakeStore(), gems, 0, 100);
    const pileLater = getItemIconPieces(fakeStore(), gems, 1, 100);
    expect(single.pieces[0].spriteId).toBe(1);
    expect(pile.pieces[0].spriteId).toBe(8);
    expect(pileLater.pieces[0].spriteId).toBe(16);
  });

  it("skips pieces Tibia leaves blank", () => {
    const blinking = createRenderTestObject({
      phases: 2,
      sprites: [21, 0],
    });
    expect(getItemIconPieces(fakeStore(), blinking, 1, 1).pieces).toEqual([]);
  });
});
