import type { ItemDisplayRarity } from "@tibia/protocol";
import { isRarityEligible } from "../rarity/isRarityEligible";
import { itemRarityOf } from "../rarity/itemRarityOf";
import type { Item } from "./Item";
import type { ItemType } from "./ItemType";

/**
 * The grade a player sees on an item: the rolled one, "common" for gear that
 * could have rolled and didn't, and nothing at all for types that never roll
 * (gold, potions, stackables). Same rule `toItemTooltip` displays, kept apart
 * so the loot filter can match on it without composing a tooltip.
 */
export function itemDisplayRarityOf(
  type: ItemType,
  item: Pick<Item, "attributes">,
): ItemDisplayRarity | undefined {
  return itemRarityOf(item) ?? (isRarityEligible(type) ? "common" : undefined);
}
