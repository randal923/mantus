import { AssetStore } from "./AssetStore";

let store: AssetStore | null = null;

/**
 * The one AssetStore shared by the world renderer and all DOM sprite
 * renderers, so the ~37 MB object catalog is fetched and parsed once.
 * Callers that need the catalog await `store.load()` (idempotent).
 */
export function getSharedAssetStore(): AssetStore {
  store ??= new AssetStore();
  return store;
}
