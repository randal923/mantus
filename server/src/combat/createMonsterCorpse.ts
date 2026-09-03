import { FORGE_RULES } from "@tibia/protocol";
import type { BoostedHooks } from "../boosted/BoostedHooks";
import type { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PreyHooks } from "../prey/PreyHooks";
import type { RarityConfig } from "../rarity/RarityConfig";
import type { World } from "../World";
import { MAX_CORPSE_LOOT_ITEMS } from "../item/maxCorpseLootItems";
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
  boostedHooks?: BoostedHooks,
  rarityConfig?: RarityConfig,
): string | null {
  const corpseType = items.itemType(monster.type.corpseItemTypeId);
  if (!corpseType) return null;
  // A corpse that is not a container cannot be opened, so it is left empty
  // exactly like Canary (`Creature::onDeath` only fills `corpse->getContainer()`).
  // Every loot-bearing monster's corpse is a container here — the catalog
  // overrides in `overrides/corpses` see to that, pinned by monsterLootParity.
  const lootable = corpseType.containerCapacity !== undefined;
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
  const loot = lootable
    ? rollMonsterLoot(monster.type.loot, lootRate, roll, rarityConfig)
    : [];
  // Improved-loot prey: pct% chance of ONE extra full loot roll for the
  // killer (Canary ondroploot_prey.lua) — not a per-item boost. The chance
  // and the extra roll are both server RNG at death execution.
  const preyPercent =
    killerId && preyHooks ? preyHooks.improvedLootPercent(killerId, monster) : 0;
  if (lootable && preyPercent > 0 && formula.chance(preyPercent)) {
    loot.push(...rollMonsterLoot(monster.type.loot, lootRate, roll, rarityConfig));
  }
  // Today's boosted creature drops one extra full loot roll (Canary
  // ondroploot_boosted.lua, factor 1.0); reward bosses are exempt exactly
  // like the upstream callback dispatch (monster.cpp:3430).
  if (
    lootable &&
    boostedHooks?.isBoostedCreature(monster) &&
    !monster.type.flags.rewardBoss
  ) {
    loot.push(...rollMonsterLoot(monster.type.loot, lootRate, roll, rarityConfig));
  }
  // Fiendish corpses carry uniform(3, 7) exalted slivers — fiendish only,
  // never influenced (Canary monster.cpp:3414-3429).
  if (lootable && monster.forgeKind === "fiendish") {
    loot.push({
      typeId: FORGE_RULES.sliverItemTypeId,
      count: formula.integer(
        FORGE_RULES.fiendishMinSlivers,
        FORGE_RULES.fiendishMaxSlivers,
      ),
    });
  }
  const stackIndex = Math.min(
    255,
    world
      .getMapItems(monster.position)
      .reduce((highest, item) => Math.max(highest, item.stackIndex), -1) + 1,
  );
  // The corpse grows to hold every drop; only the database's per-corpse
  // slot bound trims a roll, which no real table approaches at 1× rates.
  return items.createCorpse(
    killerId,
    deathEventId,
    monster.position,
    stackIndex,
    corpseType.id,
    loot.slice(0, MAX_CORPSE_LOOT_ITEMS),
    now,
  );
}
