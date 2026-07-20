import type { BestiaryCatalogEntry } from "./BestiaryCatalog";

/**
 * Unlock stage for a kill count: 0 unknown, 1 counter, 2 stats,
 * 3 resistances/locations, 4 completed (Canary's four levels).
 */
export function getBestiaryStage(
  entry: Pick<BestiaryCatalogEntry, "firstUnlock" | "secondUnlock" | "toKill">,
  kills: number,
): number {
  if (kills >= entry.toKill) return 4;
  if (kills >= entry.secondUnlock) return 3;
  if (kills >= entry.firstUnlock) return 2;
  if (kills > 0) return 1;
  return 0;
}
