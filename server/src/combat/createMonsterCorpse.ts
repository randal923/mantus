import type { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { World } from "../World";
import type { CombatFormula } from "./CombatFormula";
import { resolveMonsterLootType } from "./resolveMonsterLootType";
import { rollMonsterLoot } from "./rollMonsterLoot";

export function createMonsterCorpse(
  world: World,
  items: ItemIntentHandler,
  formula: CombatFormula,
  monster: Monster,
  killerId: string | null,
  deathEventId: string,
  now: number,
  lootRate = 1,
): void {
  const corpseType = items.itemType(monster.type.corpseItemTypeId);
  if (!corpseType || (corpseType.containerCapacity ?? 0) < 1) return;
  const loot = rollMonsterLoot(
    monster.type.loot,
    corpseType.containerCapacity ?? 0,
    lootRate,
    {
      resolve: (entry) =>
        resolveMonsterLootType(entry, {
          byId: (id) => items.itemType(id),
          byName: (name) => items.itemTypeByName(name),
        }),
      chance: (percent) => formula.chance(percent),
      integer: (minimum, maximum) => formula.integer(minimum, maximum),
    },
  );
  const stackIndex = Math.min(
    255,
    world
      .getMapItems(monster.position)
      .reduce((highest, item) => Math.max(highest, item.stackIndex), -1) + 1,
  );
  items.createCorpse(
    killerId,
    deathEventId,
    monster.position,
    stackIndex,
    corpseType.id,
    loot,
    now,
  );
}
