import type { ItemType } from "../ItemType";
import type { ItemOverride } from "./ItemOverride";

/**
 * Replaces the generated stats of each overridden item. Fails closed on an
 * override whose id is not in the catalog, so a typo or a removed item is a
 * startup error instead of tuning that silently does nothing.
 */
export function applyItemOverrides(
  items: ReadonlyArray<ItemType>,
  overrides: ReadonlyArray<ItemOverride>,
): ReadonlyArray<ItemType> {
  if (overrides.length === 0) return items;
  const byId = new Map(overrides.map((override) => [override.id, override]));
  if (byId.size !== overrides.length) {
    throw new Error("item overrides declare the same item id twice");
  }
  const applied = items.map((item) => {
    const override = byId.get(item.id);
    if (!override) return item;
    byId.delete(item.id);
    return { ...item, ...override, id: item.id, clientId: item.clientId };
  });
  if (byId.size > 0) {
    throw new Error(
      `item overrides target unknown items: ${[...byId.keys()].join(", ")}`,
    );
  }
  return applied;
}
