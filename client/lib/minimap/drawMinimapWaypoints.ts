import type { Position } from "@tibia/protocol";

const WAYPOINT_COLOR = "#ffd166";
const WAYPOINT_ACTIVE_COLOR = "#45d9ff";
const LINE_COLOR = "rgba(255, 209, 102, 0.85)";
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";

/**
 * Draws an editable waypoint ring: a solid line through consecutive
 * same-floor waypoints and a numbered dot on each.
 *
 * The ring closes back onto its first waypoint because that is what the bot
 * walks — it loops forever rather than stopping at the end.
 */
export function drawMinimapWaypoints(
  context: CanvasRenderingContext2D,
  waypoints: ReadonlyArray<Position>,
  options: {
    readonly floor: number;
    readonly left: number;
    readonly top: number;
    readonly pixelsPerTile: number;
    readonly activeIndex: number | null;
  },
): void {
  if (waypoints.length === 0) return;
  const point = (position: Position) => ({
    x: (position.x + 0.5 - options.left) * options.pixelsPerTile,
    y: (position.y + 0.5 - options.top) * options.pixelsPerTile,
  });

  context.lineWidth = 2;
  context.strokeStyle = LINE_COLOR;
  context.setLineDash([]);
  for (let index = 0; index < waypoints.length; index++) {
    const from = waypoints[index];
    const to = waypoints[(index + 1) % waypoints.length];
    if (!from || !to) continue;
    if (waypoints.length < 2) break;
    // A leg that changes floor has no meaningful line on either map.
    if (from.z !== options.floor || to.z !== options.floor) continue;
    const start = point(from);
    const end = point(to);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.font = "10px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  waypoints.forEach((waypoint, index) => {
    if (waypoint.z !== options.floor) return;
    const { x, y } = point(waypoint);
    const active = index === options.activeIndex;
    const radius = active ? 8 : 6;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = active ? WAYPOINT_ACTIVE_COLOR : WAYPOINT_COLOR;
    context.strokeStyle = OUTLINE_COLOR;
    context.lineWidth = active ? 2 : 1;
    context.fill();
    context.stroke();
    context.fillStyle = OUTLINE_COLOR;
    context.fillText(String(index + 1), x, y + 0.5);
  });
}
