import type {
  ActionBarAction,
  CarriedItemSummary,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function getActionBarActionName(
  action: ActionBarAction | null,
  spells: ReadonlyArray<SpellCatalogEntry>,
  items: ReadonlyArray<CarriedItemSummary>,
): string {
  if (!action) return "Empty";
  if (action.kind === "text") return action.text;
  if (action.kind === "spell") {
    return (
      spells.find((spell) => spell.id === action.spellId)?.name ??
      action.spellId
    );
  }
  return (
    items.find((item) => item.typeId === action.itemTypeId)?.name ??
    `Object #${action.itemTypeId}`
  );
}
