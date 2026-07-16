import {
  MAX_PROGRESSION_VALUE,
  MAX_SKILL_LEVEL,
  MIN_SKILL_LEVEL,
} from "@tibia/protocol";
import type { Skill } from "./Skill";
import type { Vocation } from "./Vocation";

const SKILL_BASE_TRIES: Readonly<Record<Skill, number>> = {
  fist: 50,
  club: 50,
  sword: 50,
  axe: 50,
  distance: 30,
  shielding: 100,
  fishing: 20,
};

export function getSkillTriesForNextLevel(
  vocation: Vocation,
  skill: Skill,
  currentLevel: number,
): number {
  if (
    !Number.isInteger(currentLevel) ||
    currentLevel < MIN_SKILL_LEVEL ||
    currentLevel > MAX_SKILL_LEVEL
  ) {
    throw new Error("skill level is out of range");
  }
  if (currentLevel === MAX_SKILL_LEVEL) return 0;
  const tries =
    SKILL_BASE_TRIES[skill] *
    vocation.skillProgressionMultipliers[skill] **
      (currentLevel - MIN_SKILL_LEVEL);
  return Math.min(MAX_PROGRESSION_VALUE, Math.floor(tries));
}
