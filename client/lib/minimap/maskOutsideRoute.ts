import type { Position } from "@tibia/protocol";

interface MaskOutsideRouteInput {
  canvas: HTMLCanvasElement;
  /** The ring being walked, in world tiles. */
  waypoints: ReadonlyArray<Position>;
  /** Kept visible too, so a character outside the cave is not hidden. */
  ownPosition?: Position | null;
  center: { x: number; y: number };
  floor: number;
  pixelsPerTile: number;
  /** How much ground around the route stays lit, in tiles. */
  radiusTiles: number;
}

/**
 * Blacks out everything the hunt does not use.
 *
 * A cave floor holds a dozen unrelated caves, and on a baked minimap they all
 * look alike — the route being edited gets lost among them. Keeping only the
 * ground within reach of the ring (and of the character) turns the map into
 * *this* hunt, drawn on the same automap black that stands for unexplored
 * ground everywhere else in the client.
 *
 * Purely presentational: it runs after the map is drawn and changes no state.
 * Waypoints keep their own tiles lit while they are dragged, so editing never
 * happens blind.
 */
export function maskOutsideRoute({
  canvas,
  waypoints,
  ownPosition,
  center,
  floor,
  pixelsPerTile,
  radiusTiles,
}: MaskOutsideRouteInput): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const onFloor = waypoints.filter((waypoint) => waypoint.z === floor);
  if (onFloor.length === 0) return;

  const dpr = canvas.width / canvas.clientWidth || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const left = center.x + 0.5 - width / (2 * pixelsPerTile);
  const top = center.y + 0.5 - height / (2 * pixelsPerTile);
  const toPixel = (position: Position) => ({
    x: (position.x - left) * pixelsPerTile,
    y: (position.y - top) * pixelsPerTile,
  });

  // The lit shape is drawn off-screen first and applied in one composite:
  // `destination-in` clips to whatever it is given, so a second shape drawn
  // straight onto the map would erase the first one instead of joining it.
  const stencil = document.createElement("canvas");
  stencil.width = canvas.width;
  stencil.height = canvas.height;
  const lit = stencil.getContext("2d");
  if (!lit) return;
  lit.setTransform(dpr, 0, 0, dpr, 0, 0);
  lit.strokeStyle = "#ffffff";
  lit.fillStyle = "#ffffff";
  lit.lineCap = "round";
  lit.lineJoin = "round";
  const thickness = Math.max(2, radiusTiles * 2 * pixelsPerTile);
  lit.lineWidth = thickness;
  lit.beginPath();
  const first = toPixel(onFloor[0]!);
  lit.moveTo(first.x, first.y);
  for (const waypoint of onFloor.slice(1)) {
    const point = toPixel(waypoint);
    lit.lineTo(point.x, point.y);
  }
  // The ring closes, so the leg back to the first waypoint is lit as well.
  if (onFloor.length > 2) lit.lineTo(first.x, first.y);
  if (onFloor.length === 1) {
    lit.arc(first.x, first.y, thickness / 2, 0, Math.PI * 2);
    lit.fill();
  } else {
    lit.stroke();
  }
  if (ownPosition && ownPosition.z === floor) {
    const own = toPixel(ownPosition);
    lit.beginPath();
    lit.arc(own.x, own.y, thickness / 2, 0, Math.PI * 2);
    lit.fill();
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(stencil, 0, 0);
  // Unlit ground reads as the automap's own unexplored black.
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
