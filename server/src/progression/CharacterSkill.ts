import type { Skill } from "./Skill";

export interface CharacterSkill {
  readonly skill: Skill;
  readonly level: number;
  readonly tries: number;
}
