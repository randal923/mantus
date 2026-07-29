/**
 * How long one animation phase lasts for content nothing gives timings for.
 *
 * The extended 15.11 Tibia.dat we rip is the legacy format: it stores a phase
 * count per object and nothing else. Tibia's real schedules come from Canary's
 * protobuf `appearances.dat` instead — see `tools/importAppearanceAnimations.mjs`
 * and `client/public/assets/appearance-animations.json`, which cover every
 * animated item and effect the DAT agrees with. This constant is only what is
 * left for an object neither source describes.
 *
 * OTClient's own fallback (`ITEM_TICKS_PER_FRAME`) is 500ms, which reads as
 * slow motion next to the real data: Tibia's median phase is 150ms.
 *
 * World items and DOM item icons share this fallback, so an unscheduled item
 * looks the same on the ground and in a container.
 */
export const LEGACY_FRAME_DURATION_MS = 100;
