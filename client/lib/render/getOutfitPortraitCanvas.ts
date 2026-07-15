import type { CharacterOutfit } from "@tibia/protocol";
import { AssetStore, type RGB } from "./AssetStore";

let storePromise: Promise<AssetStore> | null = null;
const PORTRAIT_PADDING = 2;

export async function getOutfitPortraitCanvas(
  outfitState: CharacterOutfit,
): Promise<HTMLCanvasElement> {
  storePromise ??= (() => {
    const store = new AssetStore();
    return store.load().then(() => store);
  })();
  const store = await storePromise;
  const outfit = store.outfit(outfitState.lookType);
  const pattern = { x: 2, phase: 0 } as const;
  const spriteIds: number[] = [];
  for (let layer = 0; layer < outfit.layers; layer++) {
    for (let height = 0; height < outfit.height; height++) {
      for (let width = 0; width < outfit.width; width++) {
        spriteIds.push(
          store.spriteId(outfit, {
            ...pattern,
            w: width,
            h: height,
            l: layer,
          }),
        );
      }
    }
  }
  await store.preload(spriteIds);
  const paletteColor = (index: number): RGB => {
    const color = store.outfitPalette[index];
    if (!color) throw new Error(`unknown outfit palette index ${index}`);
    return color;
  };
  const frame = store.bakeFrame(outfit, pattern, {
    head: paletteColor(outfitState.head),
    body: paletteColor(outfitState.body),
    legs: paletteColor(outfitState.legs),
    feet: paletteColor(outfitState.feet),
  });
  const context = frame.getContext("2d");
  if (!context) throw new Error("outfit portrait canvas is unavailable");
  const pixels = context.getImageData(0, 0, frame.width, frame.height).data;
  let left = frame.width;
  let top = frame.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (pixels[(y * frame.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return frame;
  const sourceX = Math.max(0, left - PORTRAIT_PADDING);
  const sourceY = Math.max(0, top - PORTRAIT_PADDING);
  const sourceRight = Math.min(frame.width - 1, right + PORTRAIT_PADDING);
  const sourceBottom = Math.min(frame.height - 1, bottom + PORTRAIT_PADDING);
  const portrait = document.createElement("canvas");
  portrait.width = sourceRight - sourceX + 1;
  portrait.height = sourceBottom - sourceY + 1;
  const portraitContext = portrait.getContext("2d");
  if (!portraitContext) throw new Error("outfit portrait canvas is unavailable");
  portraitContext.drawImage(
    frame,
    sourceX,
    sourceY,
    portrait.width,
    portrait.height,
    0,
    0,
    portrait.width,
    portrait.height,
  );
  return portrait;
}
