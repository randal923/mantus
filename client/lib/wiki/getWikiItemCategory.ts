import type { WikiItem } from "./WikiItem";
import type { WikiItemCategory } from "./WikiItemCategory";

const CATEGORY_BY_SLOT: Partial<
  Record<NonNullable<WikiItem["equipmentSlot"]>, WikiItemCategory>
> = {
  helmet: "helmets",
  armor: "armors",
  legs: "legs",
  boots: "boots",
  weapon: "weapons",
  shield: "shields",
  ammo: "ammunition",
  backpack: "backpacks",
  amulet: "amulets",
  ring: "rings",
};

const CATEGORY_BY_PRIMARY_TYPE: Readonly<Record<string, WikiItemCategory>> = {
  containers: "containers",
  food: "food",
  "creature products": "creatureProducts",
  valuables: "valuables",
  tools: "tools",
};

export function getWikiItemCategory(item: WikiItem): WikiItemCategory {
  if (item.equipmentSlot) {
    const slotCategory = CATEGORY_BY_SLOT[item.equipmentSlot];
    if (slotCategory) return slotCategory;
  }
  if (item.primaryType) {
    const primaryCategory = CATEGORY_BY_PRIMARY_TYPE[item.primaryType];
    if (primaryCategory) return primaryCategory;
  }
  return "other";
}
