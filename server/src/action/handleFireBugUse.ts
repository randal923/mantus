import {
  FIRE_BUG_IGNITE_SUCCESS_PERCENT,
  FIRE_BUG_IGNITES,
} from "./fireBugTable";
import type { ToolUseContext } from "./ToolUseContext";

/** CONST_ME_POFF: the fizzle when the spark does not catch. */
const FIZZLE_EFFECT_ID = 3;

/**
 * Canary fire_bug.lua: a 60% roll ignites the target (webs burn away, sugar
 * cane starts burning toward its harvestable stage, coal basins light);
 * anything else fizzles with a poff. Canary's rarer outcomes — the bug
 * crumbling or exploding on the user — are collapsed into the fizzle until
 * the tool context can consume carried items and deal damage (TODO.md).
 */
export function handleFireBugUse(context: ToolUseContext): boolean {
  for (const item of context.targetItems) {
    const ignite = FIRE_BUG_IGNITES.get(item.itemId);
    if (!ignite) continue;
    if (!context.rng.chance(FIRE_BUG_IGNITE_SUCCESS_PERCENT)) {
      context.effect(FIZZLE_EFFECT_ID);
      return true;
    }
    if (!context.transform(item, ignite.toTypeId)) return false;
    context.effect(ignite.effectId);
    return true;
  }
  return false;
}
