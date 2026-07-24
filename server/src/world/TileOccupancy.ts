import type { Position } from "@tibia/protocol";
import type { MapData } from "../MapData";
import { positionKey } from "../positionKey";
import type { SpatialGrid } from "../SpatialGrid";

/** A full spawn ring this far out means the temple area is packed solid. */
const SPAWN_SEARCH_RADIUS = 256;

export class TileOccupancy {
  private readonly positionReservations = new Map<string, string>();

  constructor(
    private readonly map: MapData,
    private readonly grid: SpatialGrid,
  ) {}

  isOccupied(position: Position): boolean {
    return (
      this.grid.hasCreatureAt(position) ||
      (this.positionReservations.size > 0 &&
        this.positionReservations.has(positionKey(position)))
    );
  }

  reservePosition(position: Position, reservationId: string): boolean {
    const key = positionKey(position);
    if (!this.map.isWalkable(position) || this.isOccupied(position)) {
      return false;
    }
    this.positionReservations.set(key, reservationId);
    return true;
  }

  releasePosition(position: Position, reservationId: string): void {
    const key = positionKey(position);
    if (this.positionReservations.get(key) === reservationId) {
      this.positionReservations.delete(key);
    }
  }

  findUnoccupiedPosition(preferred: Position, maxRadius: number): Position | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let y = preferred.y - radius; y <= preferred.y + radius; y++) {
        for (let x = preferred.x - radius; x <= preferred.x + radius; x++) {
          if (
            Math.max(Math.abs(x - preferred.x), Math.abs(y - preferred.y)) !==
            radius
          ) {
            continue;
          }
          const position = { x, y, z: preferred.z };
          if (this.map.isWalkable(position) && !this.isOccupied(position)) {
            return position;
          }
        }
      }
    }
    return null;
  }

  /** Spiral out from the map's spawn point until a free tile is found. */
  findSpawn(preferred?: Position): Position | null {
    if (
      preferred &&
      this.map.isWalkable(preferred) &&
      !this.isOccupied(preferred)
    ) {
      return { ...preferred };
    }
    const { x: cx, y: cy, z } = this.map.spawn;
    for (let radius = 0; radius < SPAWN_SEARCH_RADIUS; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = cx + dx;
          const y = cy + dy;
          const position = { x, y, z };
          if (this.map.isWalkable(position) && !this.isOccupied(position)) {
            return position;
          }
        }
      }
    }
    return null;
  }
}
