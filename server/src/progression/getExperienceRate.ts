import type { OwnProgressionState } from "@tibia/protocol";
import { EXPERIENCE_STAGES, getStageRate } from "./stageRates";

/**
 * Tibia's XP-gain-rate panel, composed from the same terms the kill path
 * applies (see `DeathHandler.creditExperience`): the level-staged base rate,
 * the XP boost, and the stamina multiplier.
 *
 * Display only. The server keeps applying its own multipliers per kill; this
 * just tells the player what they currently add up to (charter rule 8). It is
 * derived entirely from state the player already sees — their level, their
 * stamina, their own boost — so it shares nothing new (charter rule 6).
 *
 * Per-monster terms (prey bonus, boosted creature, animus mastery) are left
 * out on purpose: they depend on the target, not on the character.
 */
export function getExperienceRate(input: {
  readonly level: number;
  readonly baseRate: number;
  readonly useStages: boolean;
  readonly staminaMultiplier: number;
  readonly xpBoostPercent: number;
  readonly xpBoostUntilMs: number;
  readonly nowMs: number;
}): OwnProgressionState["experienceRate"] {
  const base = input.useStages
    ? getStageRate(EXPERIENCE_STAGES, input.level, input.baseRate)
    : input.baseRate;
  const boostActive = input.xpBoostUntilMs > input.nowMs;
  const xpBoostPercent = boostActive ? input.xpBoostPercent : 0;
  const staminaPercent = Math.round(input.staminaMultiplier * 100);
  const basePercent = Math.round(base * 100);
  return {
    basePercent,
    xpBoostPercent,
    xpBoostRemainingMs: boostActive ? input.xpBoostUntilMs - input.nowMs : 0,
    staminaPercent,
    totalPercent: Math.round(
      (basePercent * (100 + xpBoostPercent) * staminaPercent) / 10_000,
    ),
  };
}
