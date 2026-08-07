import { CanvasSource, Sprite, Texture } from "pixi.js";
import {
  computeLightmapPixels,
  type LightmapLight,
} from "./computeLightmapPixels";
import { from8bitColor } from "./from8bitColor";
import { TILE_SIZE } from "./tileSize";

/** Canary's LIGHT_LEVEL_DAY; at (or above) it the overlay is a no-op. */
const FULL_DAYLIGHT_LEVEL = 250;

/**
 * The world lightmap, OTClient-style: a texture with one pixel per visible
 * tile, bilinearly stretched over the map and multiplied onto everything
 * drawn beneath it. Each frame the renderer feeds it the ambient light,
 * per-floor shade resets, and every light source in draw order; the pixel
 * buffer is only recomputed when those inputs actually change.
 *
 * All positions are world map pixels in the camera floor's plane (the same
 * space the floor containers project into).
 */
export class LightOverlay {
  readonly sprite = new Sprite();
  private texture: Texture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private pixels = new Uint8Array(0);
  private firstLightIndex = new Uint32Array(0);
  private lights: LightmapLight[] = [];
  private widthTiles = 0;
  private heightTiles = 0;
  private originX = 0;
  private originY = 0;
  private ambient: readonly [number, number, number] = [255, 255, 255];
  private dark = false;
  private lastFingerprint = Number.NaN;

  constructor() {
    this.sprite.blendMode = "multiply";
    this.sprite.visible = false;
    // One texture pixel covers one tile once scaled up.
    this.sprite.scale.set(TILE_SIZE);
  }

  /** Resets the frame's light list over the drawn tile window. */
  beginFrame(
    window: {
      originX: number;
      originY: number;
      widthTiles: number;
      heightTiles: number;
    },
    ambientLevel: number,
    ambientColor: number,
  ): void {
    if (
      window.widthTiles !== this.widthTiles ||
      window.heightTiles !== this.heightTiles
    ) {
      this.allocate(window.widthTiles, window.heightTiles);
    }
    this.originX = window.originX;
    this.originY = window.originY;
    this.lights.length = 0;
    this.firstLightIndex.fill(0);
    this.dark = ambientLevel < FULL_DAYLIGHT_LEVEL;
    const brightness = Math.min(255, Math.max(0, ambientLevel)) / 255;
    const [r, g, b] = from8bitColor(ambientColor);
    this.ambient = [r * brightness, g * brightness, b * brightness];
  }

  addLightSource(
    pixelX: number,
    pixelY: number,
    intensity: number,
    color: number,
  ): void {
    if (!this.dark || intensity <= 0) return;
    const x = pixelX - this.originX * TILE_SIZE;
    const y = pixelY - this.originY * TILE_SIZE;
    // Stacked pieces of the same object (and identical overlapping sources)
    // collapse into one light at the strongest intensity, like OTClient.
    const previous = this.lights[this.lights.length - 1];
    if (
      previous &&
      previous.x === x &&
      previous.y === y &&
      previous.color === color
    ) {
      previous.intensity = Math.max(previous.intensity, intensity);
      return;
    }
    this.lights.push({ x, y, intensity, color });
  }

  /**
   * Marks a covering tile: lights added before this call (deeper floors)
   * no longer reach its pixel. Call per floor before that floor's lights.
   */
  resetShade(pixelX: number, pixelY: number): void {
    const x = Math.floor(pixelX / TILE_SIZE) - this.originX;
    const y = Math.floor(pixelY / TILE_SIZE) - this.originY;
    if (x < 0 || y < 0 || x >= this.widthTiles || y >= this.heightTiles) {
      return;
    }
    this.firstLightIndex[y * this.widthTiles + x] = this.lights.length;
  }

  /** Recomputes the texture if this frame's inputs changed, then shows it. */
  endFrame(): void {
    if (!this.dark || this.widthTiles === 0 || !this.texture) {
      this.hide();
      return;
    }
    this.sprite.visible = true;
    this.sprite.position.set(
      this.originX * TILE_SIZE,
      this.originY * TILE_SIZE,
    );
    const fingerprint = this.fingerprint();
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    computeLightmapPixels(
      this.widthTiles,
      this.heightTiles,
      this.ambient,
      this.lights,
      this.firstLightIndex,
      this.pixels,
    );
    if (!this.context || !this.imageData) return;
    this.imageData.data.set(this.pixels);
    this.context.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }

  hide(): void {
    this.sprite.visible = false;
    this.lastFingerprint = Number.NaN;
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
    this.sprite.destroy();
  }

  /**
   * The lightmap lives in a tiny 2D canvas rather than a raw buffer source:
   * canvas textures go through the same battle-tested upload path as every
   * sprite atlas, while Pixi's buffer upload proved unreliable inside a
   * frame that also streams atlas uploads.
   */
  private allocate(widthTiles: number, heightTiles: number): void {
    this.texture?.destroy(true);
    this.widthTiles = widthTiles;
    this.heightTiles = heightTiles;
    this.pixels = new Uint8Array(widthTiles * heightTiles * 4);
    this.firstLightIndex = new Uint32Array(widthTiles * heightTiles);
    this.canvas = document.createElement("canvas");
    this.canvas.width = widthTiles;
    this.canvas.height = heightTiles;
    this.context = this.canvas.getContext("2d");
    this.imageData =
      this.context?.createImageData(widthTiles, heightTiles) ?? null;
    this.texture = new Texture({
      source: new CanvasSource({
        resource: this.canvas,
        scaleMode: "linear",
      }),
    });
    this.sprite.texture = this.texture;
    this.lastFingerprint = Number.NaN;
  }

  private fingerprint(): number {
    let hash = 17;
    const mix = (value: number) => {
      hash = (hash * 31 + value) | 0;
    };
    mix(this.originX);
    mix(this.originY);
    mix(this.ambient[0]);
    mix(this.ambient[1]);
    mix(this.ambient[2]);
    for (const light of this.lights) {
      mix(light.x);
      mix(light.y);
      mix(light.intensity);
      mix(light.color);
    }
    for (let index = 0; index < this.firstLightIndex.length; index++) {
      mix(this.firstLightIndex[index] ?? 0);
    }
    return hash;
  }
}
