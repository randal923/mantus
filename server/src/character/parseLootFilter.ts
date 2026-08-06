import { DEFAULT_LOOT_FILTER, lootFilterSchema } from "@tibia/protocol";
import type { LootFilter } from "@tibia/protocol";

/**
 * Parses the persisted auto-loot filter. Anything unrecognised degrades to
 * the disabled default rather than throwing: a corrupt preference must not
 * block login, and auto-loot re-validates every take at execution time.
 *
 * Rows written before the filter became a pick-up list land here too. A
 * blacklist cannot be turned into a whitelist without inventing intent, so
 * they read as the disabled default and the player re-picks what to take.
 */
export function parseLootFilter(raw: unknown): LootFilter {
  const parsed = lootFilterSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_LOOT_FILTER, pickupRules: [] };
  const seen = new Set<number>();
  const pickupRules = parsed.data.pickupRules.filter((rule) => {
    if (seen.has(rule.typeId)) return false;
    seen.add(rule.typeId);
    return true;
  });
  return { enabled: parsed.data.enabled, pickupRules };
}
