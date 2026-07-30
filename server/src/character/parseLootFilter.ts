import { DEFAULT_LOOT_FILTER, lootFilterSchema } from "@tibia/protocol";
import type { LootFilter } from "@tibia/protocol";

/**
 * Parses the persisted auto-loot filter. Anything unrecognised degrades to
 * the disabled default rather than throwing: a corrupt preference must not
 * block login, and auto-loot re-validates every take at execution time.
 */
export function parseLootFilter(raw: unknown): LootFilter {
  const parsed = lootFilterSchema.safeParse(raw);
  if (!parsed.success) return { ...DEFAULT_LOOT_FILTER, ignoredItemTypeIds: [] };
  return {
    enabled: parsed.data.enabled,
    ignoredItemTypeIds: [...new Set(parsed.data.ignoredItemTypeIds)],
  };
}
