import type { Skill } from "@tibia/protocol";

/**
 * Offline-training conversion, ported from Canary's
 * data/scripts/creaturescripts/player/offline_training.lua. Pure and
 * deterministic: given the durable offline-training bar and how long the
 * character was offline, it computes the skill/magic tries earned. The bar,
 * the "which skill" selection, and the login gate all live in the character
 * row, so a manipulated client clock cannot manufacture training (charter).
 */

/** Skills selectable for offline training, plus magic level. */
export type OfflineTrainingTarget =
  | "fist"
  | "club"
  | "sword"
  | "axe"
  | "distance"
  | "magic";

export const OFFLINE_TRAINING_TARGETS: ReadonlyArray<OfflineTrainingTarget> = [
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "magic",
];

/** The training bar holds at most 12 hours of accrued time. */
export const MAX_OFFLINE_TRAINING_SECONDS = 12 * 3_600;
/** Must be logged out longer than 10 minutes before any tries are awarded. */
const MIN_OFFLINE_SECONDS = 600;
/** Below one minute of consumed time, nothing is awarded. */
const MIN_TRAINING_SECONDS = 60;

export interface OfflineTrainingResult {
  readonly weaponSkill: Skill | null;
  readonly weaponTries: number;
  readonly magicTries: number;
  readonly shieldingTries: number;
  /** Seconds drawn from the training bar (spent regardless of award). */
  readonly consumedBarSeconds: number;
}

export function isOfflineTrainingTarget(
  value: unknown,
): value is OfflineTrainingTarget {
  return (
    typeof value === "string" &&
    OFFLINE_TRAINING_TARGETS.includes(value as OfflineTrainingTarget)
  );
}

/**
 * Converts accrued offline time into training tries. `attackSpeedMs`,
 * `manaGainAmount`, and `manaGainIntervalMs` come from the character's top
 * (promoted) vocation, matching Canary's use of `topVocation`.
 */
export function computeOfflineTraining(params: {
  readonly target: OfflineTrainingTarget;
  readonly offlineSeconds: number;
  readonly barSeconds: number;
  readonly attackSpeedMs: number;
  readonly manaGainAmount: number;
  readonly manaGainIntervalMs: number;
  readonly rate?: number;
}): OfflineTrainingResult {
  const {
    target,
    offlineSeconds,
    barSeconds,
    attackSpeedMs,
    manaGainAmount,
    manaGainIntervalMs,
    rate = 1,
  } = params;
  const none: OfflineTrainingResult = {
    weaponSkill: null,
    weaponTries: 0,
    magicTries: 0,
    shieldingTries: 0,
    consumedBarSeconds: 0,
  };
  if (
    !Number.isFinite(offlineSeconds) ||
    offlineSeconds < 0 ||
    !Number.isFinite(barSeconds) ||
    barSeconds < 0
  ) {
    throw new Error("offline training inputs are out of range");
  }
  if (offlineSeconds < MIN_OFFLINE_SECONDS) return none;
  const trainingTime = Math.floor(
    Math.min(
      offlineSeconds,
      Math.min(MAX_OFFLINE_TRAINING_SECONDS, barSeconds),
    ),
  );
  if (trainingTime < MIN_TRAINING_SECONDS) {
    return { ...none, consumedBarSeconds: trainingTime };
  }
  if (target === "magic") {
    const gainTicks = manaGainIntervalMs / 1_000 || 1;
    const magicTries = Math.floor(
      trainingTime * (manaGainAmount / gainTicks) * rate,
    );
    return {
      weaponSkill: null,
      weaponTries: 0,
      magicTries,
      shieldingTries: magicTries > 0 ? Math.floor(trainingTime / 4) : 0,
      consumedBarSeconds: trainingTime,
    };
  }
  const modifier = attackSpeedMs / 1_000;
  const divisor = target === "distance" ? 4 : 2;
  const weaponTries = Math.floor((trainingTime / modifier / divisor) * rate);
  return {
    weaponSkill: target,
    weaponTries,
    magicTries: 0,
    shieldingTries: weaponTries > 0 ? Math.floor(trainingTime / 4) : 0,
    consumedBarSeconds: trainingTime,
  };
}
