/**
 * Canary data/scripts/actions/tools/watch.lua registers these ids to report
 * the world time. The immobile ones (pendulum clocks, the sundial) are used
 * from the map; the two watches are carried.
 */
export const MAP_CLOCK_ITEM_IDS: ReadonlySet<number> = new Set([
  2_445, 2_446, 2_447, 2_448, 2_771,
]);

export const CARRIED_WATCH_ITEM_IDS: ReadonlySet<number> = new Set([
  2_906, 6_091,
]);
