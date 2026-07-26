import type { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PreyHooks } from "../prey/PreyHooks";
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
  preyHooks?: PreyHooks,
): void {
  const corpseType = items.itemType(monster.type.corpseItemTypeId);
  if (!corpseType || (corpseType.containerCapacity ?? 0) < 1) return;
  const capacity = corpseType.containerCapacity ?? 0;
  const roll = {
    resolve: (entry: Parameters<typeof resolveMonsterLootType>[0]) =>
      resolveMonsterLootType(entry, {
        byId: (id) => items.itemType(id),
        byName: (name) => items.itemTypeByName(name),
      }),
    chance: (percent: number) => formula.chance(percent),
    integer: (minimum: number, maximum: number) =>
      formula.integer(minimum, maximum),
  };
  const loot = rollMonsterLoot(monster.type.loot, capacity, lootRate, roll);
  // Improved-loot prey: pct% chance of ONE extra full loot roll for the
  // killer (Canary ondroploot_prey.lua) — not a per-item boost. The chance
  // and the extra roll are both server RNG at death execution.
  const preyPercent =
    killerId && preyHooks ? preyHooks.improvedLootPercent(killerId, monster) : 0;
  if (preyPercent > 0 && formula.chance(preyPercent)) {
    const extra = rollMonsterLoot(
      monster.type.loot,
      Math.max(0, capacity - loot.length),
      lootRate,
      roll,
    );
    loot.push(...extra);
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
