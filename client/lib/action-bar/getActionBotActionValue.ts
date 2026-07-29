import type { ActionBotAction } from "@tibia/protocol";

/** Stable select value for one bot action; decoded by createActionBotAction. */
export function getActionBotActionValue(action: ActionBotAction): string {
  return action.kind === "spell"
    ? `spell:${action.spellId}`
    : `item:${action.itemTypeId}`;
}
