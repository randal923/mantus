import type {
  ActionBarAction,
  CarriedItemSummary,
} from "@tibia/protocol";

/**
 * Sprite identity for an object action's button. The live carried summary
 * wins; the action's stored display keeps the object drawable while the
 * character carries none of it (count 0). Null means nothing to draw.
 */
export function getActionBarActionArtwork(
  action: Extract<ActionBarAction, { kind: "item" }>,
  items: ReadonlyArray<CarriedItemSummary>,
): { readonly clientId: number; readonly spriteId: number } | null {
  const item = items.find(
    (candidate) => candidate.typeId === action.itemTypeId,
  );
  return item ?? action.display ?? null;
}
