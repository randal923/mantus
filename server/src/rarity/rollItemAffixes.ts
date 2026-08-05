import { ITEM_RARITIES, type ItemRarity } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";
import type { RarityConfig } from "./RarityConfig";
import type { RarityRoll } from "./RarityRoll";
import {
  AFFIX_ELEMENTS,
  AFFIX_IDS,
  type AffixId,
  type AffixSkill,
  type RolledAffix,
} from "./RolledAffix";

function affixSkillFor(type: ItemType): AffixSkill {
  switch (type.weaponType) {
    case "sword":
    case "axe":
    case "club":
    case "distance":
      return type.weaponType;
    default:
      return "shielding";
  }
}

/**
 * Rolls the grade's affix count from the pool, each id at most once, values
 * scaled by the grade's multiplier — counts, multipliers, and bands all from
 * the config tables. The skill affix picks the skill matching the item's
 * weapon type (shielding on everything else); resistance rolls one element.
 */
export function rollItemAffixes(
  rarity: ItemRarity,
  type: ItemType,
  roll: RarityRoll,
  config: RarityConfig,
): RolledAffix[] {
  const grade = ITEM_RARITIES.indexOf(rarity);
  const pool: AffixId[] = AFFIX_IDS.filter((id) => {
    const minimumRarity = config.affixes[id].minimumRarity;
    return (
      minimumRarity === undefined ||
      ITEM_RARITIES.indexOf(minimumRarity) <= grade
    );
  });
  const multiplier = config.valueMultipliers[rarity];
  const affixes: RolledAffix[] = [];
  const count = Math.min(config.affixCounts[rarity], pool.length);
  for (let index = 0; index < count; index += 1) {
    const picked = pool.splice(roll.integer(0, pool.length - 1), 1)[0];
    if (!picked) break;
    const range = config.affixes[picked];
    const value = Math.max(
      1,
      Math.round(roll.integer(range.minimum, range.maximum) * multiplier),
    );
    affixes.push({
      id: picked,
      value,
      ...(picked === "resistance"
        ? { element: AFFIX_ELEMENTS[roll.integer(0, AFFIX_ELEMENTS.length - 1)] }
        : {}),
      ...(picked === "skill" ? { skill: affixSkillFor(type) } : {}),
    });
  }
  return affixes;
}
