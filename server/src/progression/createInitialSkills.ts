import { MIN_SKILL_LEVEL, SKILLS } from "@tibia/protocol";
import type { CharacterSkill } from "./CharacterSkill";

export function createInitialSkills(): CharacterSkill[] {
  return SKILLS.map((skill) => ({
    skill,
    level: MIN_SKILL_LEVEL,
    tries: 0,
  }));
}
