import type { Position } from "@tibia/protocol";

/**
 * Canvas pixel -> world tile. `fractional` keeps the sub-tile position, which
 * a drag needs so a grabbed waypoint does not jump to the cursor.
 */
export function minimapPixelToTile(
  pixel: { readonly x: number; readonly y: number },
  view: {
    readonly center: { readonly x: number; readonly y: number };
    readonly width: number;
    readonly height: number;
    readonly pixelsPerTile: number;
    readonly floor: number;
  },
  fractional = false,
): Position {
  const x = view.center.x + (pixel.x - view.width / 2) / view.pixelsPerTile;
  const y = view.center.y + (pixel.y - view.height / 2) / view.pixelsPerTile;
  return fractional
    ? ({ x, y, z: view.floor } as Position)
    : { x: Math.round(x), y: Math.round(y), z: view.floor };
}
