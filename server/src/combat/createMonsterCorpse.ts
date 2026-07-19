import type { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { LootItemCreation } from "../item/LootItemCreation";
import type { World } from "../World";
import type { CombatFormula } from "./CombatFormula";

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
  const loot: LootItemCreation[] = [];
  for (const entry of monster.type.loot) {
    const chance = Math.min(100, (entry.chance / 1_000) * lootRate);
    if (!formula.chance(chance)) continue;
    const type =
      (entry.itemTypeId
        ? items.itemType(entry.itemTypeId)
        : undefined) ??
      (entry.itemName
        ? items.itemTypeByName(entry.itemName)
        : undefined);
    if (!type) continue;
    loot.push({
      typeId: type.id,
      count: Math.min(
        type.maxCount,
        formula.integer(1, entry.maxCount),
      ),
    });
    if (loot.length >= (corpseType.containerCapacity ?? 0)) break;
  }
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
