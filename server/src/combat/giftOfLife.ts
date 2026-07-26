/**
 * The green-domain revelation, shared by every vocation: fatal damage
 * within the overkill window instead heals the player, then a long
 * cooldown ticks down one second at a time while online. Values from
 * Canary player_wheel.cpp:3116-3131, 3906-3931.
 */
export const GIFT_OF_LIFE_STORAGE_KEY = "wheel:gift-of-life-cooldown";

/** CONST_ME_WATER_DROP (utils_definitions.hpp:214). */
export const GIFT_OF_LIFE_EFFECT_ID = 243;

/** Canary's message, verbatim. */
export const GIFT_OF_LIFE_MESSAGE =
  "That was close! Fortunately, your were saved by the Gift of Life.";

/** Every spell cooldown shortens by a minute when the gift fires. */
export const GIFT_OF_LIFE_SPELL_COOLDOWN_REDUCTION_MS = 60_000;

const HEAL_PERCENT_BY_STAGE = [20, 25, 30] as const;

/** 30 h / 20 h / 10 h, in ticked-down seconds. */
const COOLDOWN_SECONDS_BY_STAGE = [108_000, 72_000, 36_000] as const;

export function giftOfLifeHealPercent(stage: number): number {
  return HEAL_PERCENT_BY_STAGE[Math.min(Math.max(stage, 1), 3) - 1] ?? 0;
}

export function giftOfLifeCooldownSeconds(stage: number): number {
  return COOLDOWN_SECONDS_BY_STAGE[Math.min(Math.max(stage, 1), 3) - 1] ?? 0;
}
