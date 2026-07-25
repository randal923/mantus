import { PICK_CRUSH_STONE, PICK_DIGS } from "./harvestTables";
import type { ToolUseContext } from "./ToolUseContext";

/**
 * Canary onUsePick's non-quest branches: digging earth into a hole, and
 * crushing a boulder on a server-side coin flip that either yields gravel or
 * releases a frazzlemaw. Every quest-storage branch of the Lua function stays
 * unimplemented and falls through to the caller's failure report.
 */
export function handlePickUse(context: ToolUseContext): boolean {
  for (const item of context.targetItems) {
    const dig = PICK_DIGS.get(item.itemId);
    if (dig) return context.transform(item, dig.toTypeId);
    if (item.itemId !== PICK_CRUSH_STONE.typeId) continue;
    if (context.rng.chance(PICK_CRUSH_STONE.gravelChancePercent)) {
      if (!context.transform(item, PICK_CRUSH_STONE.gravelTypeId)) return false;
      context.say(PICK_CRUSH_STONE.gravelMessage);
      return true;
    }
    if (!context.transform(item, PICK_CRUSH_STONE.crushedTypeId)) return false;
    context.say(PICK_CRUSH_STONE.crushedMessage);
    context.spawnMonster?.(PICK_CRUSH_STONE.monsterTypeId);
    return true;
  }
  return false;
}
