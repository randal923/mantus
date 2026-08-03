import {
  DAILY_REWARD_RULES,
  MAX_CHARACTER_LEVEL,
  MAX_STAMINA_MINUTES,
  type OwnProgressionState,
} from "@tibia/protocol";
import type { Player } from "../Player";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getExperienceRate } from "./getExperienceRate";
import { getAccountRegeneration } from "./getAccountRegeneration";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";
import type { StageRow } from "./stageRates";

/** The server's own experience-rate configuration, for the display panel. */
export interface ExperienceRateConfig {
  readonly baseRate: number;
  /** Experience stage bands; empty means the flat `baseRate` applies. */
  readonly stages: ReadonlyArray<StageRow>;
}

const DEFAULT_EXPERIENCE_RATES: ExperienceRateConfig = {
  baseRate: 1,
  stages: [],
};

export function projectOwnProgression(
  player: Player,
  now: number,
  rates: ExperienceRateConfig = DEFAULT_EXPERIENCE_RATES,
): OwnProgressionState {
  const progression = player.progression;
  const vocation = getVocation(
    progression.vocation,
    progression.definitionVersion,
  );
  const regeneration = getAccountRegeneration(
    progression.vocation,
    progression.definitionVersion,
    player.accountTierAt(now),
  );
  return {
    definitionVersion: progression.definitionVersion,
    level: progression.level,
    experience: progression.experience,
    experienceForCurrentLevel: getExperienceForLevel(progression.level),
    experienceForNextLevel:
      progression.level === MAX_CHARACTER_LEVEL
        ? getExperienceForLevel(progression.level)
        : getExperienceForLevel(progression.level + 1),
    magicLevel: progression.magicLevel,
    boostedMagicLevel: Math.max(
      0,
      progression.magicLevel +
        player.wheelBonuses.skillBoosts.magic +
        player.conditions.magicLevelModifier(
          progression.magicLevel + player.wheelBonuses.skillBoosts.magic,
        ),
    ),
    manaSpent: progression.manaSpent,
    manaSpentForNextMagicLevel: getManaForNextMagicLevel(
      vocation,
      progression.magicLevel,
    ),
    health: player.health,
    maxHealth: player.maxHealth,
    mana: player.mana,
    maxMana: player.maxMana,
    capacity: player.capacity,
    soul: progression.soul,
    maxSoul: progression.maxSoul,
    stamina: player.stamina,
    maxStamina: MAX_STAMINA_MINUTES,
    staminaBonusPercent: (Math.round(
      player.staminaExperienceMultiplier(now) * 100,
    ) as 0 | 50 | 100 | 150),
    experienceRate: getExperienceRate({
      level: progression.level,
      baseRate: rates.baseRate,
      stages: rates.stages,
      staminaMultiplier: player.staminaExperienceMultiplier(now),
      xpBoostPercent: DAILY_REWARD_RULES.xpBoostPercent,
      xpBoostUntilMs: player.xpBoostUntilMs,
      nowMs: now,
    }),
    speed: progression.speed,
    attackSpeedMs: progression.attackSpeedMs,
    healthRegeneration: {
      amount: regeneration.healthAmount,
      intervalMs: regeneration.healthIntervalMs,
    },
    manaRegeneration: {
      amount: regeneration.manaAmount,
      intervalMs: regeneration.manaIntervalMs,
    },
    soulRegeneration: {
      amount: regeneration.soulAmount,
      intervalMs: regeneration.soulIntervalMs,
    },
    skills: progression.skills.map((state) => ({
      ...state,
      triesForNextLevel: getSkillTriesForNextLevel(
        vocation,
        state.skill,
        state.level,
      ),
      boostedLevel: player.skillLevel(state.skill),
    })),
  };
}
