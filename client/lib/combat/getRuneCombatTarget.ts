import type {
  CombatTarget,
  CreatureState,
  Position,
  SpellCatalogEntry,
} from "@tibia/protocol";

export function getRuneCombatTarget(
  rune: SpellCatalogEntry | undefined,
  attackTargetId: string | null,
  visibleCreatures: ReadonlyArray<CreatureState>,
  playerPosition: Position,
): CombatTarget {
  if (!rune || rune.targetKind === "target") {
    return attackTargetId
      ? { kind: "attack-target" }
      : { kind: "self" };
  }
  if (rune.targetKind === "self") return { kind: "self" };
  if (rune.targetKind === "direction") return { kind: "direction" };
  if (rune.targetKind === "target-or-direction") {
    return attackTargetId
      ? { kind: "attack-target" }
      : { kind: "direction" };
  }
  const target = visibleCreatures.find(
    (creature) => creature.id === attackTargetId,
  );
  return {
    kind: "position",
    position: target?.position ?? playerPosition,
  };
}
