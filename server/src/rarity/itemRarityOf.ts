import { ITEM_RARITIES, type ItemRarity } from "@tibia/protocol";
import type { Item } from "../item/Item";

/** Rarity grade from the item's attribute bag; invalid shapes read common. */
export function itemRarityOf(
  item: Pick<Item, "attributes">,
): ItemRarity | undefined {
  const rarity = item.attributes.rarity;
  if (typeof rarity !== "string") return undefined;
  return (ITEM_RARITIES as ReadonlyArray<string>).includes(rarity)
    ? (rarity as ItemRarity)
    : undefined;
}
