import type {
  CreatureState,
  MinimapMarker as MapMarker,
  Position,
} from "@tibia/protocol";
import type { MinimapRegionStore } from "./MinimapRegionStore";
import type { MinimapRoute } from "./MinimapRoute";
import { getNearestMinimapRouteSegment } from "./getNearestMinimapRouteSegment";

export interface MinimapMarker {
  /** Canvas position in CSS pixels. */
  x: number;
  y: number;
  creature: CreatureState;
}

export interface MinimapDrawInput {
  canvas: HTMLCanvasElement;
  store: MinimapRegionStore;
  /** View center in world tiles (fractional while panning). */
  center: { x: number; y: number };
  floor: number;
  pixelsPerTile: number;
  creatures: ReadonlyArray<CreatureState>;
  ownPlayerId: string;
  ownPosition: Position | null;
  /** The character's own persisted waypoint flags. */
  mapMarkers?: ReadonlyArray<MapMarker>;
  /** Town anchors from the map manifest; drawn only when zoomed out. */
  towns?: ReadonlyArray<{ name: string; x: number; y: number; z: number }>;
  showTownLabels?: boolean;
  /** Optional client-authored guide path. It is display-only, never movement. */
  route?: MinimapRoute | null;
  /** Used by the live minimap to pulse the tracked route without hiding it. */
  routeOpacity?: number;
}

/** Unexplored/absent terrain is black, like the classic automap. */
const VOID_COLOR = "#000000";
/** Matches the creature nameplate colors in WorldRenderer. */
const NPC_COLOR = "#66ccff";
const MONSTER_COLOR = "#ff7777";
const PLAYER_COLOR = "#44dd44";
const OWN_COLOR = "#f2efe6";
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";
const FLAG_COLOR = "#ffd166";
const TOWN_LABEL_COLOR = "rgba(242, 239, 230, 0.9)";
const ROUTE_COLOR = "#45d9ff";

function drawRoute(
  context: CanvasRenderingContext2D,
  route: MinimapRoute,
  floor: number,
  left: number,
  top: number,
  pixelsPerTile: number,
  width: number,
  height: number,
  opacity: number,
  ownPosition: Position | null,
): void {
  const segments = route.coordinates[String(floor)] ?? [];
  if (segments.length === 0) return;
  const activeSegment =
    ownPosition?.z === floor
      ? getNearestMinimapRouteSegment(segments, ownPosition)
      : null;
  const drawnSegments: ReadonlyArray<readonly [Position, Position]> =
    activeSegment && ownPosition
      ? [[ownPosition, activeSegment[1]]]
      : segments;
  const point = (position: Position) => ({
    x: (position.x + 0.5 - left) * pixelsPerTile,
    y: (position.y + 0.5 - top) * pixelsPerTile,
  });

  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash([
    Math.max(1, pixelsPerTile * 0.35),
    Math.max(4, pixelsPerTile * 1.5),
  ]);
  const previousAlpha = context.globalAlpha;
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  for (const [start, end] of drawnSegments) {
    const from = point(start);
    const to = point(end);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = OUTLINE_COLOR;
    context.lineWidth = Math.max(4, pixelsPerTile + 2);
    context.stroke();
    context.strokeStyle = ROUTE_COLOR;
    context.lineWidth = Math.max(2, pixelsPerTile * 0.55);
    context.stroke();
  }
  context.globalAlpha = previousAlpha;
  context.setLineDash([]);

  const first = point(drawnSegments[0][0]);
  const destination = activeSegment
    ? point(activeSegment[1])
    : route.destination?.z === floor
      ? point(route.destination)
      : point(drawnSegments[drawnSegments.length - 1][1]);
  for (const marker of [first, destination]) {
    context.beginPath();
    context.arc(marker.x, marker.y, 4, 0, Math.PI * 2);
    context.fillStyle = ROUTE_COLOR;
    context.strokeStyle = OUTLINE_COLOR;
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  }

  if (
    destination.x >= 0 &&
    destination.y >= 0 &&
    destination.x <= width &&
    destination.y <= height
  ) {
    context.font = "bold 11px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = 3;
    context.strokeStyle = OUTLINE_COLOR;
    context.fillStyle = ROUTE_COLOR;
    context.strokeText(route.name, destination.x, destination.y - 7);
    context.fillText(route.name, destination.x, destination.y - 7);
  }
}

/**
 * Renders terrain and creature markers onto the minimap canvas and returns
 * the drawn markers in CSS-pixel space for hover hit-testing.
 */
export function drawMinimap(input: MinimapDrawInput): MinimapMarker[] {
  const { canvas, store, center, floor, pixelsPerTile } = input;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const dpr = canvas.width / canvas.clientWidth || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = VOID_COLOR;
  ctx.fillRect(0, 0, width, height);

  // World-tile coordinate rendered at the canvas origin.
  const left = center.x + 0.5 - width / (2 * pixelsPerTile);
  const top = center.y + 0.5 - height / (2 * pixelsPerTile);
  const size = store.regionSize;
  const firstRx = Math.floor(left / size);
  const lastRx = Math.floor((left + width / pixelsPerTile) / size);
  const firstRy = Math.floor(top / size);
  const lastRy = Math.floor((top + height / pixelsPerTile) / size);
  const edge = (world: number, origin: number) =>
    Math.round((world - origin) * pixelsPerTile);
  for (let ry = firstRy; ry <= lastRy; ry++) {
    for (let rx = firstRx; rx <= lastRx; rx++) {
      const image = store.regionImage(floor, rx, ry);
      if (!image) continue;
      const x0 = edge(rx * size, left);
      const y0 = edge(ry * size, top);
      ctx.drawImage(
        image,
        x0,
        y0,
        edge((rx + 1) * size, left) - x0,
        edge((ry + 1) * size, top) - y0,
      );
    }
  }

  // Town names at low zoom, where individual tiles are unreadable anyway.
  if (input.showTownLabels && input.towns) {
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.fillStyle = TOWN_LABEL_COLOR;
    for (const town of input.towns) {
      const x = (town.x + 0.5 - left) * pixelsPerTile;
      const y = (town.y + 0.5 - top) * pixelsPerTile;
      if (x < 0 || y < 0 || x > width || y > height) continue;
      ctx.strokeText(town.name, x, y);
      ctx.fillText(town.name, x, y);
    }
  }

  if (input.route) {
    drawRoute(
      ctx,
      input.route,
      floor,
      left,
      top,
      pixelsPerTile,
      width,
      height,
      input.routeOpacity ?? 1,
      input.ownPosition,
    );
  }

  // Player-placed flags sit under the creature markers so a creature is never
  // hidden by one.
  for (const flag of input.mapMarkers ?? []) {
    if (flag.position.z !== floor) continue;
    const x = (flag.position.x + 0.5 - left) * pixelsPerTile;
    const y = (flag.position.y + 0.5 - top) * pixelsPerTile;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y - 6);
    ctx.lineTo(x + 7, y - 3);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = FLAG_COLOR;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }

  const markers: MinimapMarker[] = [];
  const margin = 8;
  for (const creature of input.creatures) {
    if (creature.id === input.ownPlayerId) continue;
    if (creature.position.z !== floor) continue;
    const x = (creature.position.x + 0.5 - left) * pixelsPerTile;
    const y = (creature.position.y + 0.5 - top) * pixelsPerTile;
    if (x < -margin || y < -margin || x > width + margin || y > height + margin) {
      continue;
    }
    if (creature.kind === "npc") {
      const radius = Math.min(9, Math.max(5, pixelsPerTile * 1.1));
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      ctx.fillStyle = NPC_COLOR;
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    } else {
      const radius = Math.min(4, Math.max(2, pixelsPerTile * 0.45));
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = creature.kind === "monster" ? MONSTER_COLOR : PLAYER_COLOR;
      ctx.strokeStyle = OUTLINE_COLOR;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
    markers.push({ x, y, creature });
  }

  if (input.ownPosition?.z === floor) {
    const x = (input.ownPosition.x + 0.5 - left) * pixelsPerTile;
    const y = (input.ownPosition.y + 0.5 - top) * pixelsPerTile;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(242, 239, 230, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = OWN_COLOR;
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }
  return markers;
}
