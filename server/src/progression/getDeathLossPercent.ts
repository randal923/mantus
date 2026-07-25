/** Canary caps the blessing set a character can carry at eight. */
export const MAX_BLESSINGS = 8;
/** Canary's floor on an unfair-fight reduction: never below 20%. */
export const MIN_UNFAIR_FIGHT_REDUCTION = 20;
/** Canary's promotion discount on every death loss. */
const PROMOTION_REDUCTION_PERCENT = 30;
/** Canary's per-blessing discount on every death loss. */
const BLESSING_REDUCTION_PERCENT = 8;
/** Below level 24 the loss is a flat percentage instead of the curve. */
const LOW_LEVEL_LOSS_PERCENT = 10;
/** Canary's `Player::getLostPercent()` takes the curve from `level >= 24`. */
const LOW_LEVEL_THRESHOLD = 24;
/**
 * Below the curve threshold Canary rounds a large blessing discount up:
 * a reduction that already reaches 40% becomes 50% before promotion is added.
 * Low-level characters with five or more blessings therefore lose noticeably
 * less than the linear 8%-each would suggest.
 */
const LOW_LEVEL_REDUCTION_TRIGGER_PERCENT = 40;
const LOW_LEVEL_REDUCTION_PERCENT = 50;

export interface DeathLossInput {
  readonly level: number;
  /** Total experience at the moment of death. */
  readonly experience: number;
  /** Progress into the current level, 0–100, as Canary's `levelPercent`. */
  readonly levelPercent: number;
  readonly promoted: boolean;
  /** Blessings carried into the death, 0–8. */
  readonly blessings: number;
  /**
   * Canary's unfair-fight reduction, 20–100. 100 means no reduction (a monster
   * kill or a fair fight); a gang kill scales the whole penalty down.
   */
  readonly unfairFightReduction: number;
}

/**
 * The fraction of experience, skill tries, and spent mana a death costs,
 * mirroring Canary's `Player::getLostPercent()` scaled by the unfair-fight
 * reduction. Every input is server-owned state read at execution time; the
 * same fraction drives all three losses, exactly as `Player::death` does.
 */
export function getDeathLossPercent(input: DeathLossInput): number {
  const {
    level,
    experience,
    levelPercent,
    promoted,
    blessings,
    unfairFightReduction,
  } = input;
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("level is out of range");
  }
  if (!Number.isSafeInteger(experience) || experience < 0) {
    throw new Error("experience is out of range");
  }
  if (!Number.isFinite(levelPercent) || levelPercent < 0 || levelPercent > 100) {
    throw new Error("level percent is out of range");
  }
  if (
    !Number.isInteger(blessings) ||
    blessings < 0 ||
    blessings > MAX_BLESSINGS
  ) {
    throw new Error("blessing count is out of range");
  }
  if (
    !Number.isFinite(unfairFightReduction) ||
    unfairFightReduction < MIN_UNFAIR_FIGHT_REDUCTION ||
    unfairFightReduction > 100
  ) {
    throw new Error("unfair fight reduction is out of range");
  }
  const onCurve = level >= LOW_LEVEL_THRESHOLD && experience > 0;
  const basePercent = onCurve
    ? curveLossPercent(level + levelPercent / 100, experience)
    : LOW_LEVEL_LOSS_PERCENT;
  // Canary applies the blessing discount first, clamps it on the low-level
  // branch, and only then adds promotion — so promotion is never clamped.
  const blessingReduction = blessings * BLESSING_REDUCTION_PERCENT;
  const clampedBlessingReduction =
    !onCurve && blessingReduction >= LOW_LEVEL_REDUCTION_TRIGGER_PERCENT
      ? LOW_LEVEL_REDUCTION_PERCENT
      : blessingReduction;
  const reduction =
    (promoted ? PROMOTION_REDUCTION_PERCENT : 0) + clampedBlessingReduction;
  const percent =
    (basePercent * Math.max(0, 1 - reduction / 100) * unfairFightReduction) /
    10_000;
  return Math.min(1, Math.max(0, percent));
}

/**
 * Canary's high-level curve: the loss tracks the experience band around the
 * current level rather than a flat share of the total, so the relative cost
 * of a death falls as the character grows.
 */
function curveLossPercent(level: number, experience: number): number {
  return (
    ((level + 50) * 50 * (level * level - 5 * level + 8)) / experience
  );
}
