import type { ActionBotAction, SpellCatalogEntry } from "@tibia/protocol";

/**
 * The catalog entry behind a bot action when that action covers an area —
 * the spell itself, or the spell a carried rune casts. Single-target actions
 * return undefined, so the crowd setting only appears where it means
 * something.
 */
export function getActionBotAreaSpell(
  action: ActionBotAction,
  spells: ReadonlyArray<SpellCatalogEntry>,
): SpellCatalogEntry | undefined {
  const spell = spells.find((candidate) =>
    action.kind === "spell"
      ? candidate.origin === "spell" && candidate.id === action.spellId
      : candidate.runeItemTypeId === action.itemTypeId,
  );
  return spell && spell.areaShape !== "single" ? spell : undefined;
}
