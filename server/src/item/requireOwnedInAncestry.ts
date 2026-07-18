import type { MoveAncestryEntry } from "./MoveAncestryEntry";

export function requireOwnedInAncestry(
  ancestry: ReadonlyArray<MoveAncestryEntry>,
  itemId: string,
  characterId: string,
): void {
  let root: MoveAncestryEntry | undefined;
  for (const entry of ancestry) {
    if (entry.originId !== itemId || entry.characterId === null) continue;
    if (!root || entry.depth > root.depth) root = entry;
  }
  if (
    root?.characterId !== characterId ||
    !["equipment", "inventory"].includes(root.locationType)
  ) {
    throw new Error("item is not owned by character");
  }
}
