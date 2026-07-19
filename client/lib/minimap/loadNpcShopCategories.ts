export type NpcShopCategories = Record<string, ReadonlyArray<string>>;

let cached: Promise<NpcShopCategories> | null = null;

/**
 * Loads the baked npc-name -> sold-item-categories table
 * (/assets/npc-shop-categories.json), cached for the session.
 */
export function loadNpcShopCategories(): Promise<NpcShopCategories> {
  cached ??= fetch("/assets/npc-shop-categories.json")
    .then((response) => (response.ok ? response.json() : { npcs: {} }))
    .then((document: { npcs?: NpcShopCategories }) => document.npcs ?? {})
    .catch(() => ({}));
  return cached;
}
