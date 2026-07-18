import type { PoolClient } from "pg";
import type { CharacterSkill } from "../progression/CharacterSkill";
import { insertCharacterSkillQuery } from "./sql/insertCharacterSkillQuery";

export async function insertCharacterSkills(
  client: PoolClient,
  characterId: string,
  skills: ReadonlyArray<CharacterSkill>,
): Promise<void> {
  for (const skill of skills) {
    await client.query(insertCharacterSkillQuery, [
      characterId,
      skill.skill,
      skill.level,
      skill.tries.toString(),
    ]);
  }
}
