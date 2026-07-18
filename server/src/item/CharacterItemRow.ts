import type { CharacterVocation } from "@tibia/protocol";

export interface CharacterItemRow {
  level: number;
  vocation: CharacterVocation;
  progression_definition_version: number;
  capacity: number;
  version: number;
  mana: number;
  soul: number;
}
