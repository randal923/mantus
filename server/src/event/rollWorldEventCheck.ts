import type { WorldEventDefinition } from "./WorldEventDefinition";

/** Canary Raid.checkInterval. */
export const WORLD_EVENT_CHECK_INTERVAL_MS = 60_000;
/** Canary's checksPerDay divisor: 23 hours of checks at the check interval. */
const CHECKS_PER_DAY = (23 * 3_600_000) / WORLD_EVENT_CHECK_INTERVAL_MS;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface WorldEventCheckState {
  readonly failedAttempts: number;
  readonly checksToday: number;
  readonly triggerWhenPossible: boolean;
  readonly lastOccurrenceAt: Date | null;
}

export interface WorldEventCheckOutcome {
  readonly fired: boolean;
  readonly failedAttempts: number;
  readonly checksToday: number;
  readonly triggerWhenPossible: boolean;
  readonly reason:
    | "fired"
    | "too-recent"
    | "checks-exhausted"
    | "roll-failed"
    | "day-not-allowed"
    | "too-few-players";
}

/**
 * Canary Raid:canStart, as one pure function of the durable roll state. The
 * roll itself is the caller's server-side RNG; nothing here reads the clock or
 * the world, so the whole decision is reproducible in a test.
 */
export function rollWorldEventCheck(input: {
  readonly event: WorldEventDefinition;
  readonly state: WorldEventCheckState;
  readonly checkedAt: Date;
  readonly activePlayers: number;
  /** Uniform roll in [1, 100_000], matching Canary's math.random(100 * 1000). */
  readonly roll: number;
}): WorldEventCheckOutcome {
  const { event, state, checkedAt } = input;
  const checksToday = state.checksToday + 1;
  const carry = {
    failedAttempts: state.failedAttempts,
    checksToday,
    triggerWhenPossible: state.triggerWhenPossible,
  };

  if (!state.triggerWhenPossible) {
    if (
      event.minGapBetweenMs !== undefined &&
      state.lastOccurrenceAt !== null &&
      checkedAt.getTime() - state.lastOccurrenceAt.getTime() <
        event.minGapBetweenMs
    ) {
      return { ...carry, fired: false, reason: "too-recent" };
    }
    if (
      event.maxChecksPerDay !== undefined &&
      state.checksToday >= event.maxChecksPerDay
    ) {
      return { ...carry, fired: false, reason: "checks-exhausted" };
    }
    const initialChance =
      event.initialChance ?? event.targetChancePerDay / CHECKS_PER_DAY;
    const increase = Math.max(
      (event.targetChancePerDay - initialChance) / CHECKS_PER_DAY,
      0,
    );
    const chance = Math.min(
      initialChance + increase * state.failedAttempts,
      event.maxChancePerCheck,
    );
    if (input.roll > chance * 1_000) {
      return {
        ...carry,
        failedAttempts: state.failedAttempts + 1,
        fired: false,
        reason: "roll-failed",
      };
    }
  }

  if (
    event.allowedDays.length > 0 &&
    !event.allowedDays.includes(WEEKDAY_NAMES[checkedAt.getDay()] ?? "")
  ) {
    return {
      ...carry,
      triggerWhenPossible: true,
      fired: false,
      reason: "day-not-allowed",
    };
  }
  if (input.activePlayers < event.minActivePlayers) {
    return {
      ...carry,
      triggerWhenPossible: true,
      fired: false,
      reason: "too-few-players",
    };
  }
  return {
    checksToday,
    failedAttempts: 0,
    triggerWhenPossible: false,
    fired: true,
    reason: "fired",
  };
}
