import type { CustomItemTint } from "@tibia/protocol";
import { getSharedAssetStore } from "./getSharedAssetStore";
import { tintSpritePixels } from "./tintSpritePixels";

/**
 * 32×32 blob-URL crops of individual atlas sprites, for DOM item icons.
 *
 * A CSS background pointing at a 4096×4096 atlas keeps the whole decoded
 * sheet (~67MB) alive in the compositor for every icon that references it —
 * on top of the WebGL world's own copy — and opening a panel full of icons
 * forces those decodes at once. Cropping each cell once from the ImageBitmap
 * the world renderer already holds costs one tiny image per distinct sprite
 * and nothing per icon.
 *
 * A tinted crop is a second variant of the same sprite, cached under its own
 * key: server-added item tiers borrow stock art and recolour its animated
 * spark, so the tint has to be baked into the pixels rather than filtered over
 * them — a CSS filter would drag the weapon's own colours along with it.
 */
const urls = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let revisionValue = 0;

function keyOf(spriteId: number, tint?: CustomItemTint): string {
  return tint ? `${spriteId}:${tint}` : String(spriteId);
}

async function generate(spriteId: number, tint?: CustomItemTint): Promise<void> {
  const store = getSharedAssetStore();
  await store.load();
  await store.preload([spriteId]);
  const rect = store.spriteRect(spriteId);
  const bitmap = store.sheetImage(rect.sheet);
  if (!bitmap) return;
  const tile = store.index.tile;
  const canvas = document.createElement("canvas");
  canvas.width = tile;
  canvas.height = tile;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.drawImage(bitmap, rect.x, rect.y, tile, tile, 0, 0, tile, tile);
  if (tint) {
    const frame = context.getImageData(0, 0, tile, tile);
    tintSpritePixels(frame.data, tint);
    context.putImageData(frame, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve),
  );
  if (!blob) return;
  urls.set(keyOf(spriteId, tint), URL.createObjectURL(blob));
}

function request(spriteId: number, tint?: CustomItemTint): void {
  const key = keyOf(spriteId, tint);
  if (spriteId <= 0 || urls.has(key) || pending.has(key)) return;
  pending.add(key);
  generate(spriteId, tint)
    // A sheet that cannot load leaves the icon blank, exactly like the world;
    // the next subscriber retries.
    .catch(() => undefined)
    .finally(() => {
      pending.delete(key);
      if (!urls.has(key)) return;
      revisionValue += 1;
      for (const listener of listeners) listener();
    });
}

export const spriteCellIconStore = {
  /** Requests any missing crops and hears about every crop that lands. */
  subscribe(
    spriteIds: ReadonlyArray<number>,
    notify: () => void,
    tint?: CustomItemTint,
  ): () => void {
    listeners.add(notify);
    for (const spriteId of spriteIds) request(spriteId, tint);
    return () => {
      listeners.delete(notify);
    };
  },

  /** Bumped whenever any crop becomes available; the React snapshot. */
  revision(): number {
    return revisionValue;
  },

  url(spriteId: number, tint?: CustomItemTint): string | null {
    return urls.get(keyOf(spriteId, tint)) ?? null;
  },
};
