import { AssetStore } from "./AssetStore";

let storePromise: Promise<AssetStore> | null = null;

/** One lazily-loaded AssetStore shared by all DOM sprite renderers. */
export function getSharedAssetStore(): Promise<AssetStore> {
  storePromise ??= (() => {
    const store = new AssetStore();
    return store.load().then(() => store);
  })();
  return storePromise;
}
