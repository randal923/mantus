import type { ItemOverride } from "../ItemOverride";

/**
 * The Loot Pouch (Canary's Gold Pouch, previously this server's Item Pouch):
 * every character owns exactly one, living in the bound container. The
 * override carries the whole identity so regenerating
 * `content/canary-item-semantics.json` can no longer revert it.
 */
export const lootPouch: ItemOverride = {
  id: 23721,
  name: "loot pouch",
  article: "a",
  description:
    "A magical pouch with infinite space for items of any kind. " +
    "All looted items go straight into it.",
  containerCapacity: 500,
  movable: false,
};
