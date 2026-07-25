/**
 * Canary data-otservbr-global/scripts/actions/other/fishing.lua. Every roll
 * driven by these tables happens server-side inside the tick.
 */

export const WORM_TYPE_ID = 3_492;
export const FISH_TYPE_ID = 3_578;

/** Water grounds a fishing rod may be used on. */
export const FISHING_WATER_IDS: ReadonlySet<number> = new Set([
  622, 4_597, 4_598, 4_599, 4_600, 12_561, 12_563, 4_601, 4_602, 4_609, 4_610,
  4_611, 4_612, 4_613, 4_614, 629, 630, 631, 632, 633, 634, 7_236, 9_582,
  13_988, 13_989, 12_560, 21_414,
]);

/** Water that only splashes: no catch roll, no worm. */
export const FISHING_DECORATIVE_IDS: ReadonlySet<number> = new Set([
  622, 13_989,
]);

/** Dawnport's shallow water; its extra fish is storage-gated in Canary. */
export const FISHING_SHALLOW_ID = 21_414;
export const FISHING_ICE_HOLE_ID = 7_236;
export const FISHING_ICE_HOLE_OPEN_ID = 7_237;
export const FISHING_SAND_ID = 13_988;
export const FISHING_SANDFISH_ID = 13_992;
export const FISHING_DIRTY_WATER_ID = 12_560;
export const FISHING_ELEMENTAL_REMAINS_ID = 9_582;

export const FISHING_LOOT_TRASH: ReadonlyArray<number> = [
  3_119, 3_123, 3_264, 3_409, 3_578,
];
export const FISHING_LOOT_COMMON: ReadonlyArray<number> = [
  3_035, 237, 12_557,
];
export const FISHING_LOOT_RARE: ReadonlyArray<number> = [3_026, 12_557];
export const FISHING_LOOT_VERY_RARE: ReadonlyArray<number> = [281, 12_557];

/** Ice-hole rarities, checked in ascending order against a 1..100 roll. */
export const FISHING_ICE_HOLE_LOOT: ReadonlyArray<{
  readonly upTo: number;
  readonly typeId: number;
}> = [
  { upTo: 1, typeId: 7_158 },
  { upTo: 4, typeId: 3_580 },
  { upTo: 10, typeId: 7_159 },
];

/** Water-elemental remains: a 1..10000 roll against Canary's `chances`. */
export const FISHING_ELEMENTAL_LOOT: ReadonlyArray<{
  readonly from: number;
  readonly to: number;
  readonly typeId: number;
}> = [
  { from: 1, to: 500, typeId: 3_026 },
  { from: 501, to: 801, typeId: 3_029 },
  { from: 802, to: 1_002, typeId: 3_032 },
  { from: 1_003, to: 1_053, typeId: 281 },
  { from: 1_054, to: 1_104, typeId: 282 },
  { from: 1_105, to: 1_115, typeId: 9_303 },
];

/**
 * Canary's catch chance: `min(max(10 + (skill - 10) * 0.597, 10), 50)` percent.
 * The skill comes from the server's own progression state, never the client.
 */
export function fishingCatchChancePercent(fishingSkill: number): number {
  return Math.min(Math.max(10 + (fishingSkill - 10) * 0.597, 10), 50);
}
