/**
 * Canary fire_bug.lua ignition targets: each transforms in place (catalog
 * decay handles burn-down/regrowth) with its own fire effect. Sugar cane is
 * the economy-relevant one — the standing field (5465) must be burned into
 * 5464, which decays in 10 s to the harvestable 5463.
 */
export interface FireBugIgnite {
  readonly toTypeId: number;
  readonly effectId: number;
}

/** CONST_ME_FIREAREA. */
const FIRE_AREA_EFFECT_ID = 7;
/** CONST_ME_HITBYFIRE. */
const HIT_BY_FIRE_EFFECT_ID = 16;

export const FIRE_BUG_IGNITE_SUCCESS_PERCENT = 60;

export const FIRE_BUG_IGNITES: ReadonlyMap<number, FireBugIgnite> = new Map([
  // Spider webs, north-south and east-west.
  [182, { toTypeId: 188, effectId: HIT_BY_FIRE_EFFECT_ID }],
  [183, { toTypeId: 189, effectId: HIT_BY_FIRE_EFFECT_ID }],
  // Standing sugar cane field.
  [5_465, { toTypeId: 5_464, effectId: FIRE_AREA_EFFECT_ID }],
  // Empty coal basin lights up.
  [2_114, { toTypeId: 2_113, effectId: HIT_BY_FIRE_EFFECT_ID }],
]);
