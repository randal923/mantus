import { MAX_STAMINA_MINUTES } from "@tibia/protocol";

/**
 * Server-authoritative stamina rules, ported from the pinned Canary checkout.
 * Pure and recomputable so persistence, tick decay, and offline regen all share
 * one deterministic source (charter: the server's limit is the real one).
 *
 * Stamina is stored in minutes. Canary references:
 *  - offline regen: data/scripts/creaturescripts/player/regenerate_stamina.lua
 *  - online decay:  data/events/scripts/player.lua (useStamina)
 *  - XP multiplier: data/libs/functions/player.lua (getFinalBonusStamina)
 */

/** Stamina at/above which the premium "green" XP bonus applies (39h). */
export const STAMINA_GREEN_THRESHOLD = 2340;
/** Stamina at/below which the "orange" XP penalty applies (14h). */
export const STAMINA_ORANGE_THRESHOLD = 840;

/** First 10 real minutes offline do not count toward regeneration. */
const OFFLINE_GRACE_SECONDS = 600;
/** Minimum countable offline time before any stamina is regenerated. */
const OFFLINE_MIN_SECONDS = 180;
/** Real seconds per regenerated stamina-minute in the normal band. */
const NORMAL_SECONDS_PER_MINUTE = 180;
/** Real seconds per regenerated stamina-minute in the green ("happy hour") band. */
const GREEN_SECONDS_PER_MINUTE = 360;
/** Offline time is capped at 21 days, matching Canary. */
const OFFLINE_CAP_SECONDS = 86_400 * 21;

/** Online decay throttle: at most one decrement per this many ms of hunting. */
const DECAY_INTERVAL_MS = 60_000;
/** When a full extra interval was skipped, two stamina-minutes are removed. */
const DECAY_DOUBLE_INTERVAL_MS = 120_000;

export interface StaminaDecay {
  readonly staminaMinutes: number;
  readonly nextDecayAt: number;
  readonly changed: boolean;
}

/**
 * Regenerated stamina after being offline for `offlineSeconds`. Normal band
 * (up to 2340) refills 1 minute per 3 real minutes; the green band (2340-2520)
 * refills slower, 1 minute per 6 real minutes. Never manufactures stamina from
 * a too-short absence, so an immediate reconnect regenerates nothing.
 */
export function regenerateOfflineStamina(
  staminaMinutes: number,
  offlineSeconds: number,
): number {
  assertStamina(staminaMinutes);
  if (!Number.isFinite(offlineSeconds) || offlineSeconds < 0) {
    throw new Error("offline seconds are out of range");
  }
  const offline =
    Math.min(Math.floor(offlineSeconds), OFFLINE_CAP_SECONDS) -
    OFFLINE_GRACE_SECONDS;
  if (offline < OFFLINE_MIN_SECONDS) return staminaMinutes;
  const maxNormalRegen =
    STAMINA_GREEN_THRESHOLD - Math.min(STAMINA_GREEN_THRESHOLD, staminaMinutes);
  const normalRegen = offline / NORMAL_SECONDS_PER_MINUTE;
  if (normalRegen > maxNormalRegen) {
    const greenRegen =
      (offline - maxNormalRegen * NORMAL_SECONDS_PER_MINUTE) /
      GREEN_SECONDS_PER_MINUTE;
    return Math.min(
      MAX_STAMINA_MINUTES,
      Math.floor(Math.max(STAMINA_GREEN_THRESHOLD, staminaMinutes) + greenRegen),
    );
  }
  return Math.min(MAX_STAMINA_MINUTES, Math.floor(staminaMinutes + normalRegen));
}

/**
 * Applies one online hunting decrement, throttled so a burst of kills within a
 * minute only costs one stamina-minute. `nextDecayAt` seeds at 0 on login so
 * the first hunt after login removes two minutes (Canary parity).
 */
export function decayHuntStamina(
  staminaMinutes: number,
  nextDecayAt: number,
  now: number,
): StaminaDecay {
  assertStamina(staminaMinutes);
  if (staminaMinutes === 0 || now <= nextDecayAt) {
    return { staminaMinutes, nextDecayAt, changed: false };
  }
  if (now - nextDecayAt > DECAY_INTERVAL_MS) {
    const next = staminaMinutes > 2 ? staminaMinutes - 2 : 0;
    return {
      staminaMinutes: next,
      nextDecayAt: now + DECAY_DOUBLE_INTERVAL_MS,
      changed: next !== staminaMinutes,
    };
  }
  return {
    staminaMinutes: staminaMinutes - 1,
    nextDecayAt: now + DECAY_INTERVAL_MS,
    changed: true,
  };
}

export interface RestingStaminaRegen {
  readonly staminaMinutes: number;
  readonly nextRegenAt: number;
  readonly changed: boolean;
}

/**
 * The daily-reward resting-area bonus (streak level 4+, Canary
 * daily_reward.lua's RegenStamina event): while the player stands in a
 * protection zone, one stamina-minute returns every 3 real minutes, slowing
 * to every 6 inside the green band — the same two rates offline regen uses.
 * The caller gates on the streak level and the zone; this only owns the clock.
 */
export function regenerateRestingStamina(
  staminaMinutes: number,
  nextRegenAt: number,
  now: number,
): RestingStaminaRegen {
  assertStamina(staminaMinutes);
  const interval =
    staminaMinutes > STAMINA_GREEN_THRESHOLD
      ? GREEN_SECONDS_PER_MINUTE * 1_000
      : NORMAL_SECONDS_PER_MINUTE * 1_000;
  if (staminaMinutes >= MAX_STAMINA_MINUTES) {
    return { staminaMinutes, nextRegenAt: now + interval, changed: false };
  }
  if (now < nextRegenAt) {
    return { staminaMinutes, nextRegenAt, changed: false };
  }
  return {
    staminaMinutes: staminaMinutes + 1,
    nextRegenAt: now + interval,
    changed: true,
  };
}

/**
 * Experience multiplier from stamina. Zero stamina yields no experience at all;
 * the green +50% bonus is premium-only; the orange band halves experience.
 */
export function getStaminaExperienceMultiplier(
  staminaMinutes: number,
  isPremium: boolean,
): number {
  assertStamina(staminaMinutes);
  if (staminaMinutes === 0) return 0;
  if (staminaMinutes > STAMINA_GREEN_THRESHOLD && isPremium) return 1.5;
  if (staminaMinutes <= STAMINA_ORANGE_THRESHOLD) return 0.5;
  return 1;
}

function assertStamina(staminaMinutes: number): void {
  if (
    !Number.isInteger(staminaMinutes) ||
    staminaMinutes < 0 ||
    staminaMinutes > MAX_STAMINA_MINUTES
  ) {
    throw new Error("stamina minutes are out of range");
  }
}
