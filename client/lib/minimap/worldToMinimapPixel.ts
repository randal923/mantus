/**
 * World tile -> canvas pixel, the exact inverse of `minimapPixelToTile` and
 * the same projection `drawMinimap` uses internally. Kept in one place so
 * hit-testing and drawing can never drift apart.
 */
export function worldToMinimapPixel(
  tile: { readonly x: number; readonly y: number },
  view: {
    readonly center: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly height: number;
    readonly pixelsPerTile: number;
  },
): { x: number; y: number } {
  return {
    x: view.width / 2 + (tile.x - view.center.x) * view.pixelsPerTile,
    y: view.height / 2 + (tile.y - view.center.y) * view.pixelsPerTile,
  };
}
