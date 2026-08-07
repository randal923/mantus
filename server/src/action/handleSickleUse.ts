import { SICKLE_CUTS } from "./harvestTables";
import type { ToolUseContext } from "./ToolUseContext";

/**
 * Canary sickle.lua: ripe sugar cane cuts down to its just-harvested form
 * (which regrows through catalog decay) and drops one bunch of sugar cane on
 * the tile. False when the tile holds nothing sickle-able.
 */
export function handleSickleUse(context: ToolUseContext): boolean {
  for (const item of context.targetItems) {
    const cut = SICKLE_CUTS.get(item.itemId);
    if (!cut) continue;
    if (!context.transform(item, cut.toTypeId)) return false;
    if (cut.yieldTypeId !== undefined) context.createOnTarget(cut.yieldTypeId);
    return true;
  }
  return false;
}
