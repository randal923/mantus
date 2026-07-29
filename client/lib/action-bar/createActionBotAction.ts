import type {
  ActionBotAction,
  InventoryItem,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { createItemAction } from "./createItemAction";
import { createSpellAction } from "./createSpellAction";

/**
 * Resolves a bot action picker value against the character's own spell list
 * and carried objects. The server revalidates the result either way.
 */
export function createActionBotAction(
  value: string,
  spells: ReadonlyArray<SpellCatalogEntry>,
  items: ReadonlyArray<InventoryItem>,
): ActionBotAction | null {
  const separator = value.indexOf(":");
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (kind === "spell") {
    const spell = spells.find(
      (candidate) => candidate.origin === "spell" && candidate.id === id,
    );
    return spell ? createSpellAction(spell) : null;
  }
  if (kind !== "item") return null;
  const item = items.find((candidate) => String(candidate.typeId) === id);
  if (!item) return null;
  const action = createItemAction(item, spells);
  return action.kind === "item" ? action : null;
}
