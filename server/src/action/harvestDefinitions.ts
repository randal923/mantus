/**
 * Bare-hands harvestables: using the item yields fruit dropped onto its own
 * tile and depletes the plant, which regrows via the depleted type's decay
 * (items.xml duration/decayTo — Canary's blueberry_bush.lua pattern).
 *
 * Ids listed here must also be in MUTABLE_ITEM_IDS in
 * tools/getMapItemSemantics.mjs (both the full and depleted types), or the
 * map placements stay baked draw-only and the use never resolves.
 */
export interface HarvestDefinition {
  /** The depleted type the plant transforms into. */
  readonly toTypeId: number;
  readonly yieldTypeId: number;
  readonly yieldCount: number;
}

export const HARVEST_DEFINITIONS: ReadonlyMap<number, HarvestDefinition> =
  new Map([
    // Blueberry bush -> picked bush (regrows after 300s), 3 blueberries.
    [3_699, { toTypeId: 3_700, yieldTypeId: 3_588, yieldCount: 3 }],
  ]);
