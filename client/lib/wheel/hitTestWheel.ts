import {
  WHEEL_CENTER,
  WHEEL_NODES,
  WHEEL_QUADRANT_NODES,
  WHEEL_RING_RADII,
  type WheelQuadrant,
} from "./wheelGeometry";

/**
 * Maps a point in 522x522 canvas coordinates to a wheel node id, using the
 * original client's math: quadrant by sign, ring by annulus, then the
 * node's angular sector (angle 0 = +x, increasing clockwise on screen).
 */
export function hitTestWheel(x: number, y: number): number | null {
  const dx = x - WHEEL_CENTER.x;
  const dy = y - WHEEL_CENTER.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const outermost = WHEEL_RING_RADII[WHEEL_RING_RADII.length - 1] ?? 0;
  if (distance === 0 || distance > outermost) return null;
  let ring = 0;
  for (let index = 0; index < WHEEL_RING_RADII.length; index++) {
    if (distance <= (WHEEL_RING_RADII[index] ?? 0)) {
      ring = index + 1;
      break;
    }
  }
  if (ring === 0) return null;
  const quadrant: WheelQuadrant =
    dy < 0
      ? dx < 0
        ? "topLeft"
        : "topRight"
      : dx < 0
        ? "bottomLeft"
        : "bottomRight";
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  for (const id of WHEEL_QUADRANT_NODES[quadrant]) {
    const node = WHEEL_NODES[id];
    if (!node || node.ring !== ring) continue;
    const sector = (Math.PI * 2) / node.totalSlices;
    if (angle >= node.slice * sector && angle <= (node.slice + 1) * sector) {
      return id;
    }
  }
  return null;
}
