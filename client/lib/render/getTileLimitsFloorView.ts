interface FloorViewFlags {
  ground: boolean;
  groundBorder: boolean;
  onBottom: boolean;
  onTop: boolean;
  blockProjectile: boolean;
  dontHide: boolean;
}

/**
 * Mirrors OTClient's Tile::limitsFloorsView: only the first thing in stack
 * order (ground < border < bottom < top < common) decides whether a tile
 * hides the floors below it, so a border-only tile carrying a cliff face
 * does not blank out the floors above the player.
 */
export function getTileLimitsFloorView(
  objects: ReadonlyArray<{ flags: FloorViewFlags }>,
  freeView: boolean,
): boolean {
  let first: FloorViewFlags | null = null;
  let firstPriority = Infinity;
  for (const { flags } of objects) {
    const priority = flags.ground
      ? 0
      : flags.groundBorder
        ? 1
        : flags.onBottom
          ? 2
          : flags.onTop
            ? 3
            : 5;
    if (priority < firstPriority) {
      first = flags;
      firstPriority = priority;
    }
  }
  if (!first || first.dontHide) return false;
  if (freeView) return first.ground || first.onBottom;
  return first.ground || (first.onBottom && first.blockProjectile);
}
