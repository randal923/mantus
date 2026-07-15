import type { Direction, Position, ViewRange } from "@tibia/protocol";
import { canSee } from "./canSee";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import type { MapData } from "./MapData";
import { getStepDurationMs } from "./getStepDurationMs";
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

export type MoveResult =
  | {
      moved: false;
      turned: boolean;
      reason: "cooldown" | "blocked" | "occupied" | "invalid-transition";
      retryAfterMs: number;
    }
  | {
      moved: true;
      turned: boolean;
      from: Position;
      durationMs: number;
    };

export class World {
  private readonly players = new Map<string, Player>();
  private readonly grid = new SpatialGrid();

  constructor(
    private readonly map: MapData,
    private readonly tickMs: number,
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

  getTile(position: Position) {
    return this.map.getTile(position);
  }

  getMapItems(position: Position) {
    return this.map.getItems(position);
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

  canSee(viewer: Position, target: Position, range: ViewRange): boolean {
    return canSee(
      viewer,
      target,
      range,
      getFirstVisibleFloor(viewer, this.map),
    );
  }

  playersVisibleFrom(position: Position, range: ViewRange): Player[] {
    const firstFloor = getFirstVisibleFloor(position, this.map);
    const floors =
      position.z > 7
        ? [position.z]
        : Array.from(
            { length: position.z - firstFloor + 1 },
            (_, index) => firstFloor + index,
          );
    const players = new Set<Player>();
    for (const z of floors) {
      const shift = position.z - z;
      const center = { x: position.x + shift, y: position.y + shift, z };
      for (const player of this.grid.query(center, range.x, range.y)) {
        if (this.canSee(position, player.position, range)) players.add(player);
      }
    }
    return [...players];
  }

  mapItemTilesVisibleFrom(position: Position, range: ViewRange) {
    const firstFloor = getFirstVisibleFloor(position, this.map);
    const floors =
      position.z > 7
        ? [position.z]
        : Array.from(
            { length: position.z - firstFloor + 1 },
            (_, index) => firstFloor + index,
          );
    const tiles = [];
    for (const z of floors) {
      const shift = position.z - z;
      const centerX = position.x + shift;
      const centerY = position.y + shift;
      for (let y = centerY - range.y; y <= centerY + range.y; y++) {
        for (let x = centerX - range.x; x <= centerX + range.x; x++) {
          const tilePosition = { x, y, z };
          const items = this.map.getItems(tilePosition);
          if (items.length === 0) continue;
          tiles.push({
            position: tilePosition,
            revision: 0,
            items: items.map(({ instanceId, itemId, stackIndex }) => ({
              instanceId,
              itemId,
              stackIndex,
            })),
          });
        }
      }
    }
    return tiles;
  }

  playersWhoCanSee(position: Position, range: ViewRange): Player[] {
    const viewerFloors =
      position.z > 7
        ? [position.z]
        : Array.from({ length: 8 - position.z }, (_, index) => position.z + index);
    const players = new Set<Player>();
    for (const z of viewerFloors) {
      const shift = z - position.z;
      const center = { x: position.x - shift, y: position.y - shift, z };
      for (const player of this.grid.query(center, range.x, range.y)) {
        if (this.canSee(player.position, position, range)) players.add(player);
      }
    }
    return [...players];
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

    if (now < player.nextStepAt) {
      return {
        moved: false,
        turned,
        reason: "cooldown",
        retryAfterMs: player.nextStepAt - now,
      };
    }
    const [dx, dy] = DIRECTION_DELTAS[direction];
    const from = player.position;
    const destination = {
      x: from.x + dx,
      y: from.y + dy,
      z: from.z,
    };
    if (!this.isWalkable(destination)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (this.isOccupied(destination)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const transition = this.map.getTransition(destination, direction);
    const resolved = transition?.destination ?? destination;
    if (!this.isWalkable(resolved)) {
      return {
        moved: false,
        turned,
        reason: transition ? "invalid-transition" : "blocked",
        retryAfterMs: 0,
      };
    }
    if (this.isOccupied(resolved)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(resolved);
    if (!groundSpeed) {
      return {
        moved: false,
        turned,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs = getStepDurationMs(
      player.stepSpeed,
      groundSpeed,
      this.tickMs,
    );
    player.moveTo(resolved);
    player.nextStepAt = now + durationMs;
    this.grid.move(player, from);
    return { moved: true, turned, from, durationMs };
  }

  tryUseMap(player: Player, target: Position, now: number): MoveResult {
    const from = player.position;
    const distance = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
    if (target.z !== from.z || distance > 1) {
      return { moved: false, turned: false, reason: "blocked", retryAfterMs: 0 };
    }
    if (now < player.nextStepAt) {
      return {
        moved: false,
        turned: false,
        reason: "cooldown",
        retryAfterMs: player.nextStepAt - now,
      };
    }
    const action = this.map.getAction(target);
    if (!action || !this.isWalkable(action.destination)) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    if (this.isOccupied(action.destination)) {
      return { moved: false, turned: false, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(action.destination);
    if (!groundSpeed) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs = getStepDurationMs(
      player.stepSpeed,
      groundSpeed,
      this.tickMs,
    );
    player.moveTo(action.destination);
    player.nextStepAt = now + durationMs;
    this.grid.move(player, from);
    return { moved: true, turned: false, from, durationMs };
  }
}
