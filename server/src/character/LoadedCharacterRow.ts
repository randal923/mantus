import type { CharacterRow } from "./CharacterRow";
import type { CharacterSkill } from "../progression/CharacterSkill";

export interface LoadedCharacterRow extends CharacterRow {
  skills: Array<{
    skill: CharacterSkill["skill"];
    level: number;
    tries: string;
  }>;
  progression_event_ids: string[];
  storage_values: Record<string, unknown>;
}
