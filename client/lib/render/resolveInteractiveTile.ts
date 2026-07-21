import type { Position } from "@tibia/protocol";

interface InteractiveTileItem {
  readonly width: number;
  readonly height: number;
  readonly flags: { readonly ground: boolean; readonly groundBorder: boolean };
}

const ANCHOR_OFFSETS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

/**
 * Multi-tile sprites (2x2 gates, large furniture) draw up-left of their
 * anchor tile, so a click on their visible pixels often lands on a tile
 * without the item. Interactions redirect to the nearest south-east anchor
 * whose multi-tile sprite covers the clicked tile — even over the clicked
 * tile's own 1x1 scenery, because the big sprite is what the player sees
 * drawn on top of it. Tiles with only 1x1 stacks resolve to themselves.
 */
export function resolveInteractiveTile(
  position: Position,
  itemsAt: (position: Position) => ReadonlyArray<InteractiveTileItem>,
): Position {
  for (const [dx, dy] of ANCHOR_OFFSETS) {
    const anchor = { x: position.x + dx, y: position.y + dy, z: position.z };
    const covers = itemsAt(anchor).some(
      (item) =>
        !item.flags.ground &&
        !item.flags.groundBorder &&
        (item.width > 1 || item.height > 1) &&
        item.width > dx &&
        item.height > dy,
    );
    if (covers) return anchor;
  }
  return position;
}
