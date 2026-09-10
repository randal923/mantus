import type { CreatureState, Position } from "@tibia/protocol";

/**
 * The monster to attack after `currentTargetId` when cycling with the
 * next/previous-target hotkeys: visible monsters on the player's floor,
 * ordered nearest first (ties by name, then id, so the order is stable
 * between presses). Cycling wraps; with no current target, or one that is
 * no longer in view, it starts at the nearest monster. Returns null when
 * nothing is targetable. The server still validates the chosen target.
 */
export function nextAttackTarget(
  creatures: ReadonlyArray<CreatureState>,
  ownPosition: Position,
  currentTargetId: string | null,
  step: 1 | -1 = 1,
): string | null {
  const ordered = creatures
    .filter(
      (creature) =>
        creature.kind === "monster" &&
        creature.position.z === ownPosition.z &&
        (creature.healthPercent === null || creature.healthPercent > 0),
    )
    .map((creature) => ({
      id: creature.id,
      name: creature.name,
      distance: Math.max(
        Math.abs(creature.position.x - ownPosition.x),
        Math.abs(creature.position.y - ownPosition.y),
      ),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  if (ordered.length === 0) return null;
  const currentIndex = currentTargetId
    ? ordered.findIndex((entry) => entry.id === currentTargetId)
    : -1;
  if (currentIndex === -1) {
    return (step === 1 ? ordered[0] : ordered[ordered.length - 1])!.id;
  }
  const nextIndex =
    (currentIndex + step + ordered.length) % ordered.length;
  return ordered[nextIndex]!.id;
}
