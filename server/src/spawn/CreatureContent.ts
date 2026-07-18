import type { MonsterType } from "../creature/MonsterType";
import type { NpcType } from "../creature/NpcType";
import type { ShopCatalog } from "../economy/ShopCatalog";
import type { SpawnSlotDefinition } from "./SpawnDefinition";

export interface CreatureContent {
  monsterTypes: ReadonlyMap<string, MonsterType>;
  npcTypes: ReadonlyMap<string, NpcType>;
  slots: ReadonlyArray<SpawnSlotDefinition>;
  shopCatalogs: ReadonlyMap<string, ShopCatalog>;
}
