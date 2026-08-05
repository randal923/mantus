import { ITEM_RARITIES, type ItemRarity } from "@tibia/protocol";
import type { WikiAffixGuideEntry } from "./wikiAffixGuide";

/** Whether the grade's affix pool includes this affix (`minimumRarity` gate). */
export function isAffixOnGrade(
  entry: WikiAffixGuideEntry,
  rarity: ItemRarity,
): boolean {
  if (!entry.minimumRarity) return true;
  return ITEM_RARITIES.indexOf(entry.minimumRarity) <= ITEM_RARITIES.indexOf(rarity);
}
