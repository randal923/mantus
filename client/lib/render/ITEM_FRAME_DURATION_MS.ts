/**
 * How long one item phase is held when nothing gives the object a schedule.
 *
 * The extended 15.11 `Tibia.dat` we rip is the legacy format: it stores a phase
 * count per object and nothing else. Tibia's real schedules come from Canary's
 * protobuf `appearances.dat` instead — see `tools/importAppearanceAnimations.mjs`
 * and `client/public/assets/appearance-animations.json`, which cover every
 * animated item (4,887) and effect (198) the DAT agrees with, so today this
 * constant only guards a stale or missing table.
 *
 * 500ms is OTClient's own `itemTicksPerFrame` (`src/client/gameconfig.h`), the
 * rate the client falls back to for the same case. World items and DOM item
 * icons share it, so an unscheduled item looks the same on the ground and in a
 * container.
 */
export const ITEM_FRAME_DURATION_MS = 500;
