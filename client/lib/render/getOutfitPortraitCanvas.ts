import type { CharacterOutfit } from "@tibia/protocol";
import { AssetStore, type RGB } from "./AssetStore";

let storePromise: Promise<AssetStore> | null = null;

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
  return store.bakeFrame(outfit, pattern, {
    head: paletteColor(outfitState.head),
    body: paletteColor(outfitState.body),
    legs: paletteColor(outfitState.legs),
    feet: paletteColor(outfitState.feet),
  });
}
