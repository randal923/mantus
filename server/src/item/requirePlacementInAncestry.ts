import type { MoveAncestryEntry } from "./MoveAncestryEntry";

export function requirePlacementInAncestry(
  ancestry: ReadonlyArray<MoveAncestryEntry>,
  itemId: string,
  destinationContainerId: string,
  itemDepth: number | null,
): void {
  const destinationAncestry = ancestry.filter(
    (entry) => entry.originId === destinationContainerId,
  );
  if (destinationAncestry.some((entry) => entry.id === itemId)) {
    throw new Error("item container cycle detected");
  }
  const destinationDepth = Math.max(
    0,
    ...destinationAncestry.map((entry) => entry.depth),
  );
  if (destinationDepth + (itemDepth ?? 1) > 8) {
    throw new Error("item container nesting exceeds 8 levels");
  }
}
