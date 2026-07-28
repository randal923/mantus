import type { RGB, TibiaObject } from "./AssetStore";
import { addonPatternYs } from "./addonPatternYs";
import { getSharedAssetStore } from "./getSharedAssetStore";
import { TILE_SIZE } from "./tileSize";

const PREVIEW_PADDING = 2;
/** Rider outfits carry an 8px up-left displacement; mounts carry none. */
const RIDER_DISPLACEMENT = 8;

export interface OutfitPreviewSelection {
  readonly lookType: number;
  readonly head: number;
  readonly body: number;
  readonly legs: number;
  readonly feet: number;
  readonly addons: number;
  /** A mount's own outfit sprite id; 0 or absent previews unmounted. */
  readonly mountLookType?: number;
}

/**
 * Bakes a south-facing idle preview for the outfit window: addon passes are
 * *composited* over the base (pattern-Y 1 and 2 per granted bit — see
 * client/ASSETS.md), and a mount draws underneath with the rider switched to
 * the riding pose (pattern-Z 1). Display only; the server re-validates every
 * selection.
 */
export async function getOutfitPreviewCanvas(
  selection: OutfitPreviewSelection,
): Promise<HTMLCanvasElement> {
  const store = getSharedAssetStore();
  await store.load();
  const outfit = store.outfit(selection.lookType);
  const mount = selection.mountLookType
    ? store.outfit(selection.mountLookType)
    : null;
  const riderZ = mount && outfit.pz > 1 ? 1 : 0;
  const addonYs = addonPatternYs(outfit, selection.addons);

  const spriteIds: number[] = [];
  const collect = (object: TibiaObject, ys: ReadonlyArray<number>, z: number) => {
    for (const y of ys) {
      for (let layer = 0; layer < object.layers; layer++) {
        for (let height = 0; height < object.height; height++) {
          for (let width = 0; width < object.width; width++) {
            spriteIds.push(
              store.spriteId(object, {
                x: 2,
                y,
                z,
                phase: 0,
                w: width,
                h: height,
                l: layer,
              }),
            );
          }
        }
      }
    }
  };
  collect(outfit, addonYs, riderZ);
  if (mount) collect(mount, [0], 0);
  await store.preload(spriteIds);

  const paletteColor = (index: number): RGB => {
    const color = store.outfitPalette[index];
    if (!color) throw new Error(`unknown outfit palette index ${index}`);
    return color;
  };
  const colors = {
    head: paletteColor(selection.head),
    body: paletteColor(selection.body),
    legs: paletteColor(selection.legs),
    feet: paletteColor(selection.feet),
  };

  const riderWidth = outfit.width * TILE_SIZE;
  const riderHeight = outfit.height * TILE_SIZE;
  const mountOffset = mount ? RIDER_DISPLACEMENT : 0;
  const frame = document.createElement("canvas");
  frame.width = Math.max(
    riderWidth,
    (mount?.width ?? 0) * TILE_SIZE + mountOffset,
  );
  frame.height = Math.max(
    riderHeight,
    (mount?.height ?? 0) * TILE_SIZE + mountOffset,
  );
  const context = frame.getContext("2d");
  if (!context) throw new Error("outfit preview canvas is unavailable");
  if (mount) {
    context.drawImage(
      store.bakeFrame(mount, { x: 2, phase: 0 }),
      mountOffset,
      mountOffset,
    );
  }
  for (const y of addonYs) {
    context.drawImage(
      store.bakeFrame(outfit, { x: 2, y, z: riderZ, phase: 0 }, colors),
      0,
      0,
    );
  }

  // Alpha-trim to the drawn bounding box, like the character portrait.
  const pixels = new Uint32Array(
    context.getImageData(0, 0, frame.width, frame.height).data.buffer,
  );
  let left = frame.width;
  let top = frame.height;
  let right = -1;
  let bottom = -1;
  let index = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++, index++) {
      if (pixels[index] >>> 24 === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return frame;
  const sourceX = Math.max(0, left - PREVIEW_PADDING);
  const sourceY = Math.max(0, top - PREVIEW_PADDING);
  const sourceRight = Math.min(frame.width - 1, right + PREVIEW_PADDING);
  const sourceBottom = Math.min(frame.height - 1, bottom + PREVIEW_PADDING);
  const preview = document.createElement("canvas");
  preview.width = sourceRight - sourceX + 1;
  preview.height = sourceBottom - sourceY + 1;
  const previewContext = preview.getContext("2d");
  if (!previewContext) throw new Error("outfit preview canvas is unavailable");
  previewContext.drawImage(
    frame,
    sourceX,
    sourceY,
    preview.width,
    preview.height,
    0,
    0,
    preview.width,
    preview.height,
  );
  return preview;
}
