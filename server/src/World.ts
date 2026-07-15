import type { Direction, Position } from "@tibia/protocol";
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

  get templePosition(): Position {
    return { ...this.map.spawn };
  }

  isWalkable(position: Position): boolean {
    return this.map.isWalkable(position);
  }

  isOccupied(position: Position): boolean {
    return this.grid.query(position, 0, 0).length > 0;
  }

  /** Players within the view box centered on (x, y). */
  playersNear(
    position: Position,
    range: { x: number; y: number },
  ): Player[] {
    return this.grid.query(position, range.x, range.y);
  }

  /** Spiral out from the map's spawn point until a free tile is found. */
  findSpawn(preferred?: Position): Position | null {
    if (
      preferred &&
      this.isWalkable(preferred) &&
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
          if (this.isWalkable(position) && !this.isOccupied(position)) {
            return position;
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
    const from = player.position;
    const destination = {
      x: from.x + dx,
      y: from.y + dy,
      z: from.z,
    };
    if (!this.isWalkable(destination) || this.isOccupied(destination)) {
      return { moved: false, turned };
    }
    player.moveTo(destination);
    player.lastStepAt = now;
    this.grid.move(player, from);
    return { moved: true, turned };
  }
}
