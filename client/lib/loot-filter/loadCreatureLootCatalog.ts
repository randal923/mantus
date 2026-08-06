import type { LootFilterItem } from "@tibia/protocol";
import { parseCreatureLootCatalog } from "./parseCreatureLootCatalog";

let cached: Promise<ReadonlyArray<LootFilterItem>> | null = null;

/**
 * Loads the baked creature-drop catalog (/assets/creature-loot-items.json),
 * cached for the session. The loot-filter window unmounts when it closes, so
 * without this the 1,500-entry document would be re-read and re-validated
 * every time it is opened; the asset only changes when the item catalog is
 * rebuilt, which cannot happen while the page is open.
 */
export function loadCreatureLootCatalog(): Promise<
  ReadonlyArray<LootFilterItem>
> {
  cached ??= fetch("/assets/creature-loot-items.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`creature loot catalog ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    })
    .then(parseCreatureLootCatalog)
    .catch((cause: unknown) => {
      // A failed load is not cached: the next window opening may well be
      // online again, and an empty search pane is worth one retry.
      cached = null;
      throw cause;
    });
  return cached;
}
