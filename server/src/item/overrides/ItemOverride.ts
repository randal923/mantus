import type { ItemType } from "../ItemType";

/**
 * A hand-edited change to one generated catalog item.
 *
 * `id` picks the item; every other field replaces the generated value, so
 * re-importing `data/item-catalog.json` from the Tibia assets never clobbers
 * tuning. Fields left out keep whatever the catalog says. Nested objects
 * (`requirements`, `absorbPercent`, `render`, ...) replace wholesale rather
 * than merging key by key.
 *
 * `clientId` is deliberately not overridable: it is the asset identity the
 * client renders and the key the catalog is loaded under.
 */
export type ItemOverride = {
  readonly id: number;
} & Partial<Omit<ItemType, "id" | "clientId">>;
