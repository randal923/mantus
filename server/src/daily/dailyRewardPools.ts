import type { CharacterVocation } from "@tibia/protocol";
import { baseVocationOf } from "../progression/baseVocationOf";

// Canary daily_reward.lua:68-75 (per-base-vocation pools) and :141-144
// (training weapons). Ids are transcribed verbatim; entries the pinned
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

export const TRAINING_ITEM_POOL = [
  28_540, 28_541, 28_542, 28_543, 28_544, 28_545, 44_064, 50_292,
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
