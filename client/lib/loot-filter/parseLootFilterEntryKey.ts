import { ITEM_DISPLAY_RARITIES, type ItemDisplayRarity } from "@tibia/protocol";

interface ParsedLootFilterEntryKey {
  readonly typeId: number;
  readonly rarity?: ItemDisplayRarity;
}

/**
 * Reads a cell key back out of a drag payload. Drops come from the DOM, so
 * anything that is not a key this window wrote is rejected rather than
 * coerced.
 */
export function parseLootFilterEntryKey(
  raw: string,
): ParsedLootFilterEntryKey | null {
  const [id, grade, ...rest] = raw.split(":");
  if (rest.length > 0 || id === undefined) return null;
  const typeId = Number.parseInt(id, 10);
  if (!Number.isInteger(typeId) || typeId <= 0 || String(typeId) !== id) {
    return null;
  }
  if (grade === undefined) return { typeId };
  const rarity = ITEM_DISPLAY_RARITIES.find((value) => value === grade);
  return rarity ? { typeId, rarity } : null;
}
