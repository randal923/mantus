import type { Direction, MapState } from "@tibia/protocol";
import { Player } from "./Player";

const DIRECTION_DELTAS: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export interface MoveResult {
  moved: boolean;
  turned: boolean;
}

export class World {
  private readonly players = new Map<string, Player>();
  private readonly blocked: ReadonlySet<string>;

  constructor(
    readonly width: number,
    readonly height: number,
    blockedTiles: ReadonlyArray<readonly [number, number]>,
    private readonly stepCooldownMs: number,
  ) {
    this.blocked = new Set(blockedTiles.map(([x, y]) => `${x},${y}`));
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return !this.blocked.has(`${x},${y}`);
  }

  isOccupied(x: number, y: number): boolean {
    for (const player of this.players.values()) {
      if (player.x === x && player.y === y) return true;
    }
    return false;
  }

  /** Spiral out from the center until a free tile is found. */
  findSpawn(): { x: number; y: number } | null {
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    const maxRadius = Math.max(this.width, this.height);
    for (let radius = 0; radius < maxRadius; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (this.isWalkable(x, y) && !this.isOccupied(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
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
    if (!this.isWalkable(nx, ny) || this.isOccupied(nx, ny)) {
      return { moved: false, turned };
    }
    player.x = nx;
    player.y = ny;
    player.lastStepAt = now;
    return { moved: true, turned };
  }

  toMapState(): MapState {
    return {
      width: this.width,
      height: this.height,
      blocked: [...this.blocked].map((key) => {
        const [x = 0, y = 0] = key.split(",").map(Number);
        return [x, y] as [number, number];
      }),
    };
  }
}
