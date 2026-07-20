import type { CreatureState, Position } from "@tibia/protocol";
import type { MinimapRegionStore } from "./MinimapRegionStore";

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
}

/** Unexplored/absent terrain is black, like the classic automap. */
const VOID_COLOR = "#000000";
/** Matches the creature nameplate colors in WorldRenderer. */
const NPC_COLOR = "#66ccff";
const MONSTER_COLOR = "#ff7777";
const PLAYER_COLOR = "#44dd44";
const OWN_COLOR = "#f2efe6";
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.85)";

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
