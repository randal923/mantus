import type { Skill } from "@tibia/protocol";

/**
 * Exercise-weapon (training-dummy) rules, ported from Canary's
 * data/scripts/actions/items/exercise_training_weapons.lua. Per training tick a
 * weapon grants skill tries (or a magic weapon grants mana-spent), a dummy's
 * `rate` scales the gain, and one weapon charge is consumed. The award and the
 * charge decrement are one server-side step; the client only requests the use.
 */

/** Base skill tries granted per tick by a non-magic exercise weapon. */
const BASE_SKILL_TRIES = 7;
/** Base mana-spent granted per tick by a magic exercise weapon. */
const BASE_MAGIC_MANA = 600;

export type ExerciseTrainingTarget = Skill | "magic";

export interface ExerciseTrainingGain {
  readonly skill: Skill | null;
  readonly skillTries: number;
  readonly magicManaSpent: number;
}

/**
 * The per-tick gain for one exercise-training tick. `dummyRate` is the dummy's
 * items.xml rate (100 = ×1.0, 110 = ×1.1); `rate` is the server's configured
 * exercise-training speed multiplier.
 */
export function computeExerciseTrainingGain(params: {
  readonly target: ExerciseTrainingTarget;
  readonly dummyRate: number;
  readonly rate?: number;
}): ExerciseTrainingGain {
  const { target, dummyRate, rate = 1 } = params;
  if (!Number.isFinite(dummyRate) || dummyRate <= 0 || rate < 0) {
    throw new Error("exercise training inputs are out of range");
  }
  const multiplier = (dummyRate / 100) * rate;
  if (target === "magic") {
    return {
      skill: null,
      skillTries: 0,
      magicManaSpent: Math.floor(BASE_MAGIC_MANA * multiplier),
    };
  }
  return {
    skill: target,
    skillTries: Math.floor(BASE_SKILL_TRIES * multiplier),
    magicManaSpent: 0,
  };
}

/**
 * Real milliseconds between exercise-training ticks. Faster dummies and a
 * higher configured rate shorten the interval (Canary: baseAttackSpeed / rate).
 */
export function exerciseTrainingIntervalMs(
  attackSpeedMs: number,
  rate = 1,
): number {
  if (!Number.isFinite(attackSpeedMs) || attackSpeedMs <= 0 || rate <= 0) {
    throw new Error("exercise training interval inputs are out of range");
  }
  return Math.max(1, Math.round(attackSpeedMs / rate));
}
