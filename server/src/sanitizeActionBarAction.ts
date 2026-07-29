import type { ActionBarAction, CharacterVocation } from "@tibia/protocol";
import type { SpellRegistry } from "./combat/SpellRegistry";
import { getSpellActionTargetMode } from "./combat/getSpellActionTargetMode";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";

/**
 * Re-derives one client-proposed action from server-owned catalogs: the spell
 * must exist and belong to the character's vocation, the object must be a real
 * item type. Returns null when the action cannot be honoured.
 */
export function sanitizeActionBarAction(
  action: ActionBarAction,
  vocation: CharacterVocation,
  spells: SpellRegistry,
  items: ItemIntentHandler,
): ActionBarAction | null {
  if (action.kind === "text") return { ...action };
  if (action.kind === "item") {
    const type = items.itemType(action.itemTypeId);
    if (!type || (action.mode === "equip" && !type.equipmentSlot)) {
      return null;
    }
    return { ...action };
  }
  const spell = spells.get(action.spellId);
  if (
    !spell ||
    spell.origin !== "spell" ||
    !spell.vocations.includes(vocation)
  ) {
    return null;
  }
  const targetMode = getSpellActionTargetMode(
    spell.targetKind,
    action.targetMode,
  );
  return { ...action, targetMode };
}
