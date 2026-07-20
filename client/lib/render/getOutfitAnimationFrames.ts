import type { CreatureOutfit } from "@tibia/protocol";
import type { RGB, SpritePattern } from "./AssetStore";
import { getSharedAssetStore } from "./getSharedAssetStore";

const FRAME_PADDING = 2;
const WALK_FRAME_DURATION_MS = 150;

export interface OutfitAnimationFrames {
  /** Same-size canvases cropped to the union bounding box (no jitter). */
  readonly frames: ReadonlyArray<HTMLCanvasElement>;
  readonly frameDurationMs: number;
}

const bakedByOutfit = new Map<string, Promise<OutfitAnimationFrames>>();

/**
 * Bakes a south-facing walk cycle (phases 1..n-1, falling back to the idle
 * phase) for DOM display, cropped like the static portrait but with one
 * shared bounding box across all frames. Results are memoized per outfit so
 * lazily mounted bestiary cells re-appear instantly.
 */
export function getOutfitAnimationFrames(
  outfitState: CreatureOutfit,
): Promise<OutfitAnimationFrames> {
  const key = [
    outfitState.lookType,
    outfitState.head,
    outfitState.body,
    outfitState.legs,
    outfitState.feet,
    outfitState.addons,
  ].join(":");
  const cached = bakedByOutfit.get(key);
  if (cached) return cached;
  const baking = bakeOutfitAnimationFrames(outfitState);
  bakedByOutfit.set(key, baking);
  baking.catch(() => bakedByOutfit.delete(key));
  return baking;
}

async function bakeOutfitAnimationFrames(
  outfitState: CreatureOutfit,
): Promise<OutfitAnimationFrames> {
  const store = await getSharedAssetStore();
  const outfit = store.outfit(outfitState.lookType);
  const phases =
    outfit.phases > 1
      ? Array.from({ length: outfit.phases - 1 }, (_, index) => index + 1)
      : [0];
  const patterns: SpritePattern[] = phases.map((phase) => ({ x: 2, phase }));
  const spriteIds: number[] = [];
  for (const pattern of patterns) {
    for (let layer = 0; layer < outfit.layers; layer++) {
      for (let height = 0; height < outfit.height; height++) {
        for (let width = 0; width < outfit.width; width++) {
          spriteIds.push(
            store.spriteId(outfit, { ...pattern, w: width, h: height, l: layer }),
          );
        }
      }
    }
  }
  await store.preload(spriteIds);
  const paletteColor = (index: number): RGB => {
    const color = store.outfitPalette[index];
    if (!color) throw new Error(`unknown outfit palette index ${index}`);
    return color;
  };
  const colors = {
    head: paletteColor(outfitState.head),
    body: paletteColor(outfitState.body),
    legs: paletteColor(outfitState.legs),
    feet: paletteColor(outfitState.feet),
  };
  const baked = patterns.map((pattern) => store.bakeFrame(outfit, pattern, colors));

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = -1;
  let bottom = -1;
  for (const frame of baked) {
    const context = frame.getContext("2d");
    if (!context) throw new Error("outfit animation canvas is unavailable");
    const pixels = context.getImageData(0, 0, frame.width, frame.height).data;
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        if (pixels[(y * frame.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) {
    return { frames: baked, frameDurationMs: WALK_FRAME_DURATION_MS };
  }
  const first = baked[0];
  const sourceX = Math.max(0, left - FRAME_PADDING);
  const sourceY = Math.max(0, top - FRAME_PADDING);
  const sourceRight = Math.min(first.width - 1, right + FRAME_PADDING);
  const sourceBottom = Math.min(first.height - 1, bottom + FRAME_PADDING);
  const width = sourceRight - sourceX + 1;
  const height = sourceBottom - sourceY + 1;
  const frames = baked.map((frame) => {
    const cropped = document.createElement("canvas");
    cropped.width = width;
    cropped.height = height;
    const context = cropped.getContext("2d");
    if (!context) throw new Error("outfit animation canvas is unavailable");
    context.drawImage(frame, sourceX, sourceY, width, height, 0, 0, width, height);
    return cropped;
  });
  return { frames, frameDurationMs: WALK_FRAME_DURATION_MS };
}
