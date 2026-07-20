export const WIKI_ITEM_CATEGORIES = [
  "all",
  "helmets",
  "armors",
  "legs",
  "boots",
  "weapons",
  "shields",
  "ammunition",
  "backpacks",
  "amulets",
  "rings",
  "containers",
  "food",
  "creatureProducts",
  "valuables",
  "tools",
  "other",
] as const;

export type WikiItemCategory = (typeof WIKI_ITEM_CATEGORIES)[number];
