import type { MonsterType } from "../creature/MonsterType";
import type { NpcType } from "../creature/NpcType";
import type { SpawnSlotDefinition } from "./SpawnDefinition";

export interface CreatureContent {
  monsterTypes: ReadonlyMap<string, MonsterType>;
  npcTypes: ReadonlyMap<string, NpcType>;
  slots: ReadonlyArray<SpawnSlotDefinition>;
}
