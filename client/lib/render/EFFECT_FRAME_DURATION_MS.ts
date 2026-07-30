/**
 * How long one magic-effect phase is held when the schedule table misses it.
 *
 * 75ms is OTClient's `effectTicksPerFrame` (`src/client/gameconfig.h`); effects
 * run far faster than items, whose fallback is `ITEM_FRAME_DURATION_MS`.
 */
export const EFFECT_FRAME_DURATION_MS = 75;
