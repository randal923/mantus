import type { ItemType } from "../item/ItemType";
import { isRarityEligible } from "./isRarityEligible";
import type { RarityConfig } from "./RarityConfig";
import type { RarityRoll } from "./RarityRoll";
import { rollItemAffixes } from "./rollItemAffixes";
import { rollItemRarity } from "./rollItemRarity";

/**
 * Single entry point for loot creation: rolls grade and affixes for an
 * eligible type, shaped for the item's attribute bag. Undefined means the
 * item drops common — the overwhelmingly usual case.
 */
export function rollRarityAttributes(
  type: ItemType,
  roll: RarityRoll,
  config: RarityConfig,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRarityEligible(type)) return undefined;
  const rarity = rollItemRarity(roll, config.chances);
  if (!rarity) return undefined;
  return { rarity, affixes: rollItemAffixes(rarity, type, roll, config) };
}
