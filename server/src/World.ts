import type { Direction } from "@tibia/protocol";
import type { MapData } from "./MapData";
import { Player } from "./Player";
import { SpatialGrid } from "./SpatialGrid";

const DIRECTION_DELTAS: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

/** A full spawn ring this far out means the temple area is packed solid. */
const SPAWN_SEARCH_RADIUS = 256;

export interface MoveResult {
  moved: boolean;
  turned: boolean;
}

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export class World {
  private readonly players = new Map<string, Player>();
  private readonly grid = new SpatialGrid();

  constructor(
    private readonly map: MapData,
    private readonly stepCooldownMs: number,
  ) {}

  get mapName(): string {
    return this.map.name;
  }

  get templePosition(): WorldPosition {
    return { ...this.map.spawn };
  }

  isWalkable(x: number, y: number, z: number): boolean {
    return this.map.isWalkable(x, y, z);
  }

  isOccupied(x: number, y: number, z: number): boolean {
    return this.grid.query(x, y, z, 0, 0).length > 0;
  }

  /** Players within the view box centered on (x, y). */
  playersNear(
    x: number,
    y: number,
    z: number,
    range: { x: number; y: number },
  ): Player[] {
    return this.grid.query(x, y, z, range.x, range.y);
  }

  /** Spiral out from the map's spawn point until a free tile is found. */
  findSpawn(preferred?: WorldPosition): WorldPosition | null {
    if (
      preferred &&
      this.isWalkable(preferred.x, preferred.y, preferred.z) &&
      !this.isOccupied(preferred.x, preferred.y, preferred.z)
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
          if (this.isWalkable(x, y, z) && !this.isOccupied(x, y, z)) {
            return { x, y, z };
          }
        }
      }
    }
    return null;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
    this.grid.insert(player);
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.grid.remove(player);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  allPlayers(): Iterable<Player> {
    return this.players.values();
  }

  playerStates() {
    return [...this.players.values()].map((player) => player.toState());
  }

  /**
   * Validates and applies one step. All rules live here, at execution time:
   * walk-speed cooldown, bounds, blocked tiles, occupancy (charter rules 4, 8).
   */
  tryMove(player: Player, direction: Direction, now: number): MoveResult {
    const turned = player.direction !== direction;
    player.direction = direction;

    if (now - player.lastStepAt < this.stepCooldownMs) {
      return { moved: false, turned };
    }
    const [dx, dy] = DIRECTION_DELTAS[direction];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!this.isWalkable(nx, ny, player.z) || this.isOccupied(nx, ny, player.z)) {
      return { moved: false, turned };
    }
    const fromX = player.x;
    const fromY = player.y;
    player.x = nx;
    player.y = ny;
    player.lastStepAt = now;
    this.grid.move(player, fromX, fromY);
    return { moved: true, turned };
  }
}
