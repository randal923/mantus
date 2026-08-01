import type { CharacterVocation } from "@tibia/protocol";
import { baseVocationOf } from "../progression/baseVocationOf";

// Canary daily_reward.lua:68-75 (per-base-vocation pools). Entries the pinned
// catalog does not carry are filtered at projection time, never remapped.

const PALADIN_POOL = [
  266, 236, 268, 237, 7642, 23374, 3203, 3161, 3178, 3153, 3197, 3149, 3164,
  3200, 3192, 3188, 3190, 3189, 3191, 3158, 3152, 3180, 3173, 3176, 3195,
  3175, 3155, 3202,
] as const;

const DRUID_POOL = [
  266, 268, 237, 238, 23373, 3203, 3161, 3178, 3153, 3197, 3149, 3164, 3200,
  3192, 3188, 3190, 3189, 3156, 3191, 3158, 3152, 3180, 3173, 3176, 3195,
  3175, 3155, 3202,
] as const;

const SORCERER_POOL = [
  266, 268, 237, 238, 23373, 3203, 3161, 3178, 3153, 3197, 3149, 3164, 3200,
  3192, 3188, 3190, 3189, 3191, 3158, 3152, 3180, 3173, 3176, 3195, 3175,
  3155, 3202,
] as const;

const KNIGHT_POOL = [
  266, 236, 239, 7643, 23375, 268, 3203, 3161, 3178, 3153, 3197, 3149, 3164,
  3200, 3192, 3188, 3190, 3189, 3191, 3158, 3152, 3180, 3173, 3176, 3195,
  3175, 3155, 3202,
] as const;

const MONK_POOL = [
  266, 236, 268, 237, 7642, 23374, 3203, 3161, 3178, 3153, 3197, 3149, 3164,
  3200, 3192, 3188, 3190, 3189, 3191, 3158, 3152, 3180, 3173, 3176, 3195,
  3175, 3155, 3202,
] as const;

/** Normal 500-charge exercise weapons, including shielding and fist skill. */
export const EXERCISE_WEAPON_POOL = [
  28_552, 28_553, 28_554, 28_555, 28_556, 28_557, 44_065, 50_293,
] as const;

const POOLS: Record<string, ReadonlyArray<number>> = {
  Knight: KNIGHT_POOL,
  Paladin: PALADIN_POOL,
  Sorcerer: SORCERER_POOL,
  Druid: DRUID_POOL,
  Monk: MONK_POOL,
};

export function dailyRewardPoolFor(
  vocation: CharacterVocation,
): ReadonlyArray<number> {
  return POOLS[baseVocationOf(vocation)] ?? [266, 268];
}
