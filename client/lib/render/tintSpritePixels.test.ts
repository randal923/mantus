import { describe, expect, it } from "vitest";
import { tintSpritePixels } from "./tintSpritePixels";

/** The exact colours the lasting exercise wand's art is drawn from. */
const SPARK = [237, 77, 183];
const SPARK_CORE = [255, 223, 245];
const WOOD = [118, 88, 40];

function hueOf([red, green, blue]: ReadonlyArray<number>): number {
  const r = red! / 255;
  const g = green! / 255;
  const b = blue! / 255;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) return -1;
  const sector =
    max === r
      ? ((((g - b) / chroma) % 6) + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return sector * 60;
}

function tinted(
  rgb: ReadonlyArray<number>,
  tint: "purple" | "dark-orange",
): number[] {
  const pixels = new Uint8ClampedArray([...rgb, 255]);
  tintSpritePixels(pixels, tint);
  return [...pixels].slice(0, 3);
}

describe("tintSpritePixels", () => {
  it("moves the magenta spark to the tier's own hue", () => {
    expect(hueOf(tinted(SPARK, "purple"))).toBeCloseTo(282, 0);
    expect(hueOf(tinted(SPARK, "dark-orange"))).toBeCloseTo(26, 0);
  });

  it("darkens the orange tint so it reads as orange, not as skin", () => {
    const orange = tinted(SPARK, "dark-orange");
    const lightness = (Math.max(...orange) + Math.min(...orange)) / 2;
    const source = (Math.max(...SPARK) + Math.min(...SPARK)) / 2;

    expect(lightness).toBeLessThan(source);
  });

  it("leaves the weapon's own wood alone", () => {
    expect(tinted(WOOD, "purple")).toEqual(WOOD);
    expect(tinted(WOOD, "dark-orange")).toEqual(WOOD);
  });

  it("keeps a near-white spark core bright rather than colouring it in", () => {
    const core = tinted(SPARK_CORE, "purple");

    expect(Math.min(...core)).toBeGreaterThan(200);
  });

  it("never touches a transparent pixel", () => {
    const pixels = new Uint8ClampedArray([237, 77, 183, 0]);

    tintSpritePixels(pixels, "purple");

    expect([...pixels]).toEqual([237, 77, 183, 0]);
  });
});
