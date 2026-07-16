import type {
  CombatTarget,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function getSpellCombatTarget(
  spell: SpellCatalogEntry,
  attackTargetId: string | null,
): CombatTarget {
  if (spell.targetKind === "self") return { kind: "self" };
  if (spell.targetKind === "direction") return { kind: "direction" };
  if (spell.targetKind === "target-or-direction" && !attackTargetId) {
    return { kind: "direction" };
  }
  return { kind: "attack-target" };
}
