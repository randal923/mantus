import type { CustomItemTint } from "@tibia/protocol";

/**
 * Recolours the animated spark on a borrowed sprite, in place.
 *
 * Exercise weapons are drawn as a wooden weapon with a magenta spark crawling
 * along it, phase by phase — that spark *is* the weapon's animation. A custom
 * tier copies the stock art, so the only thing that can tell the tiers apart
 * is the spark's colour. Wood sits at hue 30–42 and the spark at a flat 320,
 * so shifting only the magenta band recolours the lightning and leaves the
 * weapon exactly as it was.
 *
 * Saturation and lightness are kept, so the spark's bright core stays a core
 * and its dim tail stays a tail; only the hue moves (and, for a tint that has
 * to read as dark, the lightness scales with it).
 */
const SPARK_HUE_MIN = 285;
const SPARK_HUE_MAX = 355;
/** Below this the pixel is grey and has no hue worth moving. */
const MIN_SATURATION = 0.15;

const TINTS: Readonly<
  Record<CustomItemTint, { readonly hue: number; readonly lightness: number }>
> = {
  purple: { hue: 282, lightness: 1 },
  "dark-orange": { hue: 26, lightness: 0.78 },
};

export function tintSpritePixels(
  pixels: Uint8ClampedArray,
  tint: CustomItemTint,
): void {
  const target = TINTS[tint];
  for (let index = 0; index < pixels.length; index += 4) {
    if ((pixels[index + 3] ?? 0) < 8) continue;
    const red = (pixels[index] ?? 0) / 255;
    const green = (pixels[index + 1] ?? 0) / 255;
    const blue = (pixels[index + 2] ?? 0) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max - min;
    if (chroma === 0) continue;
    const lightness = (max + min) / 2;
    const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
    if (saturation < MIN_SATURATION) continue;
    const hue =
      60 *
      (max === red
        ? (((green - blue) / chroma) % 6 + 6) % 6
        : max === green
          ? (blue - red) / chroma + 2
          : (red - green) / chroma + 4);
    if (hue < SPARK_HUE_MIN || hue > SPARK_HUE_MAX) continue;
    const [nextRed, nextGreen, nextBlue] = hslToRgb(
      target.hue,
      saturation,
      Math.min(1, lightness * target.lightness),
    );
    pixels[index] = nextRed;
    pixels[index + 1] = nextGreen;
    pixels[index + 2] = nextBlue;
  }
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = lightness - chroma / 2;
  const [red, green, blue] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  return [
    Math.round((red + base) * 255),
    Math.round((green + base) * 255),
    Math.round((blue + base) * 255),
  ];
}
