import { getMagicEffectId } from "../combat/getMagicEffectId";
import { MACHETE_CLEARS, MACHETE_CUTS } from "./harvestTables";
import type { ToolUseContext } from "./ToolUseContext";

/**
 * Canary onUseMachete: cuts jungle grass and reed into their spent forms
 * (catalog decay regrows them) and clears wild growth outright. Returns false
 * when nothing on the tile is cuttable, so the caller reports the failure.
 */
export function handleMacheteUse(context: ToolUseContext): boolean {
  for (const item of context.targetItems) {
    const cut = MACHETE_CUTS.get(item.itemId);
    if (cut) {
      if (!context.transform(item, cut.toTypeId)) return false;
      if (cut.yieldTypeId !== undefined) {
        context.createOnTarget(cut.yieldTypeId);
      }
      return true;
    }
    if (!MACHETE_CLEARS.has(item.itemId)) continue;
    if (!context.remove(item)) return false;
    context.effect(getMagicEffectId("CONST_ME_POFF"));
    return true;
  }
  return false;
}
