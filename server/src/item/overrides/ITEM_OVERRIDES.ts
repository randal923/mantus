import type { ItemOverride } from "./ItemOverride";
import { boundItems } from "./utilities/bound-items";
import { lootPouch } from "./utilities/loot-pouch";

/**
 * Hand-edited item stats, applied over the generated catalog at load.
 *
 * Scaffold a file with the item's current values: `yarn item:override 7382`.
 * It writes `overrides/<category>/<item-name>.ts` and registers it here; then
 * edit the numbers. Delete the file and its entry to fall back to Canary.
 *
 * ```ts
 * // overrides/sword-weapons/demonrage-sword.ts
 * export const demonrageSword: ItemOverride = {
 *   id: 7382,
 *   attack: 50, // was 47
 *   requirements: { level: 75, vocations: ["Knight", "Elite Knight"] },
 * };
 * ```
 */
export const ITEM_OVERRIDES: ReadonlyArray<ItemOverride> = [
  lootPouch,
  boundItems,
];
