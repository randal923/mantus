import type { ActionBarAction, SpellCatalogEntry } from "@tibia/protocol";

/** The targeting a spell button defaults to, from what the spell can aim at. */
export function createSpellAction(
  spell: SpellCatalogEntry,
): Extract<ActionBarAction, { kind: "spell" }> {
  return {
    kind: "spell",
    spellId: spell.id,
    targetMode:
      spell.targetKind === "self"
        ? "self"
        : spell.targetKind === "direction"
          ? "direction"
          : spell.targetKind === "position"
            ? "crosshair"
            : "attack-target",
  };
}
