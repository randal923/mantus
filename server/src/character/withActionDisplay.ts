import type { ActionBarAction } from "@tibia/protocol";
import type { ItemType } from "../item/ItemType";

/**
 * Backfills the catalog display identity on an object action persisted before
 * displays were stored, so a loaded bar or bot rule can keep drawing its icon
 * and name while the character carries none of the object. Spell and text
 * actions, and object actions whose type no longer exists, pass through
 * untouched.
 */
export function withActionDisplay<Action extends ActionBarAction | null>(
  action: Action,
  itemType: (itemTypeId: number) => ItemType | undefined,
): Action {
  if (!action || action.kind !== "item") return action;
  const type = itemType(action.itemTypeId);
  if (!type) return action;
  return {
    ...action,
    display: {
      name: type.name,
      clientId: type.clientId,
      spriteId: type.spriteId,
    },
  } as Action;
}
