import { describe, expect, it } from "vitest";
import { computeLightmapPixels } from "./computeLightmapPixels";
import { TILE_SIZE } from "./tileSize";

const WIDTH = 5;
const HEIGHT = 5;

function compute(
  ambient: readonly [number, number, number],
  lights: Parameters<typeof computeLightmapPixels>[3],
  firstLightIndex = new Uint32Array(WIDTH * HEIGHT),
): Uint8Array {
  const out = new Uint8Array(WIDTH * HEIGHT * 4);
  computeLightmapPixels(WIDTH, HEIGHT, ambient, lights, firstLightIndex, out);
  return out;
}

const pixel = (out: Uint8Array, x: number, y: number) => {
  const offset = (y * WIDTH + x) * 4;
  return [out[offset], out[offset + 1], out[offset + 2], out[offset + 3]];
};

const tileCenter = (tile: number) => tile * TILE_SIZE + TILE_SIZE / 2;

describe("computeLightmapPixels", () => {
  it("fills every pixel with the ambient color when there are no lights", () => {
    const out = compute([40, 40, 40], []);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        expect(pixel(out, x, y)).toEqual([40, 40, 40, 255]);
      }
    }
  });

  it("applies radial falloff from the light center", () => {
    const out = compute([0, 0, 0], [
      { x: tileCenter(2), y: tileCenter(2), intensity: 5, color: 215 },
    ]);
    const center = pixel(out, 2, 2)[0]!;
    const oneAway = pixel(out, 1, 2)[0]!;
    const twoAway = pixel(out, 0, 2)[0]!;
    expect(center).toBe(255); // (5 - 0) * 0.2 = 1 → full white
    expect(oneAway).toBeLessThan(center);
    expect(twoAway).toBeLessThan(oneAway);
    expect(twoAway).toBeGreaterThan(0);
  });

  it("cuts a light off past its radius in tiles", () => {
    const out = compute([10, 10, 10], [
      { x: tileCenter(0), y: tileCenter(0), intensity: 2, color: 215 },
    ]);
    // Four tiles away is well beyond a radius of two tiles.
    expect(pixel(out, 4, 0)).toEqual([10, 10, 10, 255]);
  });

  it("combines ambient and lights per channel with max, not addition", () => {
    // 210 decodes to (255, 255, 0) — yellow over a green ambient.
    const out = compute([0, 200, 0], [
      { x: tileCenter(2), y: tileCenter(2), intensity: 5, color: 210 },
    ]);
    expect(pixel(out, 2, 2)).toEqual([255, 255, 0, 255]);
    // Far corner: the light is weaker than the ambient there, so green
    // keeps the ambient value while red shows only the light's share.
    const corner = pixel(out, 0, 4);
    expect(corner[1]).toBe(200);
    expect(corner[0]).toBeGreaterThan(0);
    expect(corner[0]).toBeLessThan(200);
    expect(corner[2]).toBe(0);
  });

  it("hides lights from pixels shaded by a covering floor", () => {
    const firstLightIndex = new Uint32Array(WIDTH * HEIGHT);
    // The covering tile at (2,2) only sees lights added from index 1 on.
    firstLightIndex[2 * WIDTH + 2] = 1;
    const out = compute(
      [0, 0, 0],
      [{ x: tileCenter(2), y: tileCenter(2), intensity: 5, color: 215 }],
      firstLightIndex,
    );
    expect(pixel(out, 2, 2)).toEqual([0, 0, 0, 255]);
    expect(pixel(out, 1, 2)[0]).toBeGreaterThan(0);
  });
});
