import type { ItemRarity } from "@tibia/protocol";
import type { RarityChances } from "./RarityChances";
import type { RarityRoll } from "./RarityRoll";

const PER_100K = 1_000;

/**
 * One roll against the cumulative rarity thresholds, best grade first, on the
 * same per-100k scale monster loot uses. Returns undefined (common) when the
 * roll lands past every configured chance.
 */
export function rollItemRarity(
  roll: RarityRoll,
  chances: RarityChances,
): ItemRarity | undefined {
  const legendary = Math.round(chances.legendary * PER_100K);
  const epic = legendary + Math.round(chances.epic * PER_100K);
  const rare = epic + Math.round(chances.rare * PER_100K);
  const uncommon = rare + Math.round(chances.uncommon * PER_100K);
  if (uncommon <= 0) return undefined;
  const value = roll.integer(1, 100_000);
  if (value <= legendary) return "legendary";
  if (value <= epic) return "epic";
  if (value <= rare) return "rare";
  if (value <= uncommon) return "uncommon";
  return undefined;
}
