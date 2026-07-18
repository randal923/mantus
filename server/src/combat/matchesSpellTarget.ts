import type { CombatTarget } from "@tibia/protocol";
import type { SpellDefinition } from "./Spell";

export function matchesSpellTarget(
  spell: SpellDefinition,
  target: CombatTarget,
): boolean {
  if (spell.targetKind === "self") return target.kind === "self";
  if (spell.targetKind === "position") return target.kind === "position";
  if (spell.targetKind === "direction") return target.kind === "direction";
  if (spell.targetKind === "target-or-direction") {
    return (
      target.kind === "attack-target" ||
      target.kind === "creature" ||
      target.kind === "direction"
    );
  }
  return target.kind === "attack-target" || target.kind === "creature";
}
