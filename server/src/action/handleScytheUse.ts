import { SCYTHE_CUTS } from "./harvestTables";
import type { ToolUseContext } from "./ToolUseContext";

/**
 * Canary onUseScythe: burning sugar cane, wheat, and reed each cut down to a
 * spent form that regrows through catalog decay and drop one bunch on the
 * tile. False when the tile holds nothing harvestable.
 */
export function handleScytheUse(context: ToolUseContext): boolean {
  for (const item of context.targetItems) {
    const cut = SCYTHE_CUTS.get(item.itemId);
    if (!cut) continue;
    if (!context.transform(item, cut.toTypeId)) return false;
    if (cut.yieldTypeId !== undefined) context.createOnTarget(cut.yieldTypeId);
    return true;
  }
  return false;
}
