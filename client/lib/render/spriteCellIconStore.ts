import { getSharedAssetStore } from "./getSharedAssetStore";

/**
 * 32×32 blob-URL crops of individual atlas sprites, for DOM item icons.
 *
 * A CSS background pointing at a 4096×4096 atlas keeps the whole decoded
 * sheet (~67MB) alive in the compositor for every icon that references it —
 * on top of the WebGL world's own copy — and opening a panel full of icons
 * forces those decodes at once. Cropping each cell once from the ImageBitmap
 * the world renderer already holds costs one tiny image per distinct sprite
 * and nothing per icon.
 */
const urls = new Map<number, string>();
const pending = new Set<number>();
const listeners = new Set<() => void>();
let revisionValue = 0;

async function generate(spriteId: number): Promise<void> {
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
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve),
  );
  if (!blob) return;
  urls.set(spriteId, URL.createObjectURL(blob));
}

function request(spriteId: number): void {
  if (spriteId <= 0 || urls.has(spriteId) || pending.has(spriteId)) return;
  pending.add(spriteId);
  generate(spriteId)
    // A sheet that cannot load leaves the icon blank, exactly like the world;
    // the next subscriber retries.
    .catch(() => undefined)
    .finally(() => {
      pending.delete(spriteId);
      if (!urls.has(spriteId)) return;
      revisionValue += 1;
      for (const listener of listeners) listener();
    });
}

export const spriteCellIconStore = {
  /** Requests any missing crops and hears about every crop that lands. */
  subscribe(
    spriteIds: ReadonlyArray<number>,
    notify: () => void,
  ): () => void {
    listeners.add(notify);
    for (const spriteId of spriteIds) request(spriteId);
    return () => {
      listeners.delete(notify);
    };
  },

  /** Bumped whenever any crop becomes available; the React snapshot. */
  revision(): number {
    return revisionValue;
  },

  url(spriteId: number): string | null {
    return urls.get(spriteId) ?? null;
  },
};
