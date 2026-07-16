import {
  MAX_CHARACTER_LEVEL,
  type OwnProgressionState,
} from "@tibia/protocol";
import type { Player } from "../Player";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";

export function projectOwnProgression(player: Player): OwnProgressionState {
  const progression = player.progression;
  const vocation = getVocation(
    progression.vocation,
    progression.definitionVersion,
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
    speed: progression.speed,
    attackSpeedMs: progression.attackSpeedMs,
    healthRegeneration: {
      amount: vocation.regeneration.healthAmount,
      intervalMs: vocation.regeneration.healthIntervalMs,
    },
    manaRegeneration: {
      amount: vocation.regeneration.manaAmount,
      intervalMs: vocation.regeneration.manaIntervalMs,
    },
    soulRegeneration: {
      amount: vocation.regeneration.soulAmount,
      intervalMs: vocation.regeneration.soulIntervalMs,
    },
    skills: progression.skills.map((state) => ({
      ...state,
      triesForNextLevel: getSkillTriesForNextLevel(
        vocation,
        state.skill,
        state.level,
      ),
    })),
  };
}
