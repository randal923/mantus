import type { HuntingPosition, HuntingSpot } from "./HuntingPlace";

interface SpotMapView {
  readonly center: { readonly x: number; readonly y: number };
  readonly floor: number;
  readonly pixelsPerTile: number;
  /** World tile to a pixel inside the canvas, matching `drawMinimap`. */
  project: (position: HuntingPosition) => { x: number; y: number };
}

/**
 * Room kept around the outermost pins, in pixels rather than tiles: what has
 * to fit there is a name label, whose size does not change with the zoom.
 */
const EDGE_PADDING_X = 200;
const EDGE_PADDING_Y = 90;
const MAX_PIXELS_PER_TILE = 6;
const MIN_PIXELS_PER_TILE = 0.3;

/**
 * Frames every entrance of a hunt in one view, and answers where each one
 * lands on the canvas so a pin can be put there. The projection is
 * `drawMinimap`'s own: the view's top-left tile is the centre minus half the
 * canvas, measured in tiles.
 */
export function spotMapView(
  spots: ReadonlyArray<HuntingSpot>,
  width: number,
  height: number,
): SpotMapView {
  const positions = spots.map((spot) => spot.Position);
  const xs = positions.map((position) => position.x);
  const ys = positions.map((position) => position.y);
  const center =
    positions.length === 0
      ? { x: 0, y: 0 }
      : {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: (Math.min(...ys) + Math.max(...ys)) / 2,
        };
  const spanX = positions.length === 0 ? 1 : Math.max(...xs) - Math.min(...xs);
  const spanY = positions.length === 0 ? 1 : Math.max(...ys) - Math.min(...ys);
  const pixelsPerTile = Math.min(
    MAX_PIXELS_PER_TILE,
    Math.max(
      MIN_PIXELS_PER_TILE,
      Math.min(
        Math.max(width - EDGE_PADDING_X, 1) / Math.max(spanX, 1),
        Math.max(height - EDGE_PADDING_Y, 1) / Math.max(spanY, 1),
      ),
    ),
  );
  const left = center.x + 0.5 - width / (2 * pixelsPerTile);
  const top = center.y + 0.5 - height / (2 * pixelsPerTile);
  return {
    center,
    floor: dominantFloor(positions),
    pixelsPerTile,
    project: (position) => ({
      x: (position.x - left) * pixelsPerTile,
      y: (position.y - top) * pixelsPerTile,
    }),
  };
}

function dominantFloor(positions: ReadonlyArray<HuntingPosition>): number {
  const counts = new Map<number, number>();
  for (const position of positions) {
    counts.set(position.z, (counts.get(position.z) ?? 0) + 1);
  }
  return (
    [...counts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0] - right[0],
    )[0]?.[0] ?? 7
  );
}
