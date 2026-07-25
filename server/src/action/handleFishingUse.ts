import { getMagicEffectId } from "../combat/getMagicEffectId";
import {
  FISHING_DECORATIVE_IDS,
  FISHING_DIRTY_WATER_ID,
  FISHING_ELEMENTAL_LOOT,
  FISHING_ELEMENTAL_REMAINS_ID,
  FISHING_ICE_HOLE_ID,
  FISHING_ICE_HOLE_LOOT,
  FISHING_ICE_HOLE_OPEN_ID,
  FISHING_LOOT_COMMON,
  FISHING_LOOT_RARE,
  FISHING_LOOT_TRASH,
  FISHING_LOOT_VERY_RARE,
  FISHING_SAND_ID,
  FISHING_SANDFISH_ID,
  FISHING_WATER_IDS,
  FISH_TYPE_ID,
  WORM_TYPE_ID,
  fishingCatchChancePercent,
} from "./fishingTables";
import type { ToolUseContext } from "./ToolUseContext";
import type { MapItem } from "../MapItem";

const SANDFISH_CHANCE_PERCENT = 4;

/**
 * Canary's fishing action. The water type, the catch chance (from the server's
 * own fishing skill), and every rarity roll are decided here inside the tick;
 * the worm is consumed in the same atomic operation that creates the catch, so
 * a replayed use can never spend a worm without producing its result or the
 * other way round (charter rules 1, 2, 4).
 */
export function handleFishingUse(context: ToolUseContext): boolean {
  const water = context.targetItems.find((item) =>
    FISHING_WATER_IDS.has(item.itemId),
  );
  if (!water) return false;

  if (water.itemId === FISHING_ELEMENTAL_REMAINS_ID) {
    return fishElementalRemains(context, water);
  }
  if (water.itemId === FISHING_DIRTY_WATER_ID) {
    context.effect(getMagicEffectId("CONST_ME_WATERSPLASH"));
    const roll = context.rng.integer(1, 100);
    const table =
      roll === 1
        ? FISHING_LOOT_VERY_RARE
        : roll <= 3
          ? FISHING_LOOT_RARE
          : roll <= 10
            ? FISHING_LOOT_COMMON
            : FISHING_LOOT_TRASH;
    context.grantCarried(context.rng.pick(table), 1);
    return true;
  }
  if (water.itemId !== FISHING_ICE_HOLE_ID) {
    context.effect(getMagicEffectId("CONST_ME_LOSEENERGY"));
  }
  // Decorative water only splashes: Canary returns before any roll.
  if (FISHING_DECORATIVE_IDS.has(water.itemId)) return true;

  const hasWorm = context.carriedCount(WORM_TYPE_ID) > 0;
  // Canary advances the skill on every attempt made while carrying bait.
  if (hasWorm) context.advanceFishing(1);
  if (
    !context.rng.chance(
      fishingCatchChancePercent(context.player.skillLevel("fishing")),
    )
  ) {
    return true;
  }
  if (!hasWorm) return true;

  if (water.itemId === FISHING_SAND_ID) {
    context.transform(water, water.itemId + 1);
    if (context.rng.chance(SANDFISH_CHANCE_PERCENT)) {
      context.grantCarried(FISHING_SANDFISH_ID, 1, WORM_TYPE_ID);
      return true;
    }
    context.grantCarried(FISH_TYPE_ID, 1, WORM_TYPE_ID);
    return true;
  }
  if (water.itemId === FISHING_ICE_HOLE_ID) {
    // The open hole's catalog decay re-freezes it, matching Canary's timer.
    context.transform(water, FISHING_ICE_HOLE_OPEN_ID);
    const roll = context.rng.integer(1, 100);
    const rarity = FISHING_ICE_HOLE_LOOT.find((entry) => roll <= entry.upTo);
    context.grantCarried(rarity?.typeId ?? FISH_TYPE_ID, 1, WORM_TYPE_ID);
    return true;
  }
  context.grantCarried(FISH_TYPE_ID, 1, WORM_TYPE_ID);
  return true;
}

/**
 * Canary's water-elemental remains: only the corpse owner may fish it, and a
 * 1..10000 roll decides between the gem table and rubbish.
 */
function fishElementalRemains(
  context: ToolUseContext,
  remains: MapItem,
): boolean {
  const owner = (context.world.getWorldItem(remains.instanceId)?.attributes ??
    remains.source?.attributes ??
    {}).ownerCharacterId;
  if (typeof owner === "string" && owner !== context.player.id) {
    context.say("You are not the owner.");
    return true;
  }
  context.effect(getMagicEffectId("CONST_ME_WATERSPLASH"));
  context.transform(remains, remains.itemId + 1);
  const roll = context.rng.integer(1, 10_000);
  const prize = FISHING_ELEMENTAL_LOOT.find(
    (entry) => roll >= entry.from && roll <= entry.to,
  );
  if (!prize) {
    context.say("There was just rubbish in it.");
    return true;
  }
  context.grantCarried(prize.typeId, 1);
  return true;
}
