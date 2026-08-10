import { from8bitColor } from "./from8bitColor";
import { TILE_SIZE } from "./tileSize";

export interface LightmapLight {
  /** Light center in window-local map pixels (not tile coordinates). */
  x: number;
  y: number;
  /** Radius in tiles; also scales the brightness at the center. */
  intensity: number;
  /** 8-bit Tibia palette index. */
  color: number;
}

/**
 * Fills an RGBA buffer with one pixel per tile, OTClient's lightmap math:
 * each pixel starts at the ambient color and takes the per-channel maximum
 * of every light whose radial falloff `(intensity - distance) * 0.2`
 * reaches its tile center. `firstLightIndex` implements floor shading — a
 * tile pixel only sees lights added at or after its index, so lights from
 * floors below a covering ground never bleed through it.
 */
export function computeLightmapPixels(
  widthTiles: number,
  heightTiles: number,
  ambient: readonly [number, number, number],
  lights: ReadonlyArray<LightmapLight>,
  firstLightIndex: Uint32Array,
  out: Uint8Array,
): void {
  const decoded = lights.map((light) => from8bitColor(light.color));
  const half = TILE_SIZE / 2;
  for (let y = 0; y < heightTiles; y++) {
    for (let x = 0; x < widthTiles; x++) {
      const index = y * widthTiles + x;
      const centerX = x * TILE_SIZE + half;
      const centerY = y * TILE_SIZE + half;
      let r = ambient[0];
      let g = ambient[1];
      let b = ambient[2];
      for (let i = firstLightIndex[index] ?? 0; i < lights.length; i++) {
        const light = lights[i];
        const dx = centerX - light.x;
        const dy = centerY - light.y;
        const distanceSq = dx * dx + dy * dy;
        const radius = light.intensity * TILE_SIZE;
        if (distanceSq > radius * radius) continue;
        const strength = Math.min(
          1,
          (light.intensity - Math.sqrt(distanceSq) / TILE_SIZE) * 0.2,
        );
        if (strength < 0.01) continue;
        const color = decoded[i];
        r = Math.max(r, color[0] * strength);
        g = Math.max(g, color[1] * strength);
        b = Math.max(b, color[2] * strength);
      }
      const offset = index * 4;
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = 255;
    }
  }
}
