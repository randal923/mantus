import type { Position } from "@tibia/protocol";
import type { Player } from "./Player";
import { positionKey } from "./positionKey";

/**
 * Buckets players into fixed-size cells so visibility queries touch only the
 * cells overlapping the search box instead of every player in the world.
 * Coordinates are read from the player at insert time; callers must re-bucket
 * via move() whenever a player's position changes.
 */
export class SpatialGrid {
  private readonly cells = new Map<string, Set<Player>>();

  constructor(private readonly cellSize = 8) {}

  private cellKey(position: Position): string {
    return positionKey({
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
      z: position.z,
    });
  }

  insert(player: Player): void {
    const key = this.cellKey(player.position);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(player);
  }

  /** Remove using the player's current coordinates. */
  remove(player: Player): void {
    this.removeAt(player, player.position);
  }

  /** Re-bucket after a position change. */
  move(player: Player, from: Position): void {
    const fromKey = this.cellKey(from);
    const toKey = this.cellKey(player.position);
    if (fromKey === toKey) return;
    this.removeAt(player, from);
    this.insert(player);
  }

  /** Players within the box |px - x| <= rangeX and |py - y| <= rangeY. */
  query(
    center: Position,
    rangeX: number,
    rangeY: number,
  ): Player[] {
    const found: Player[] = [];
    const minCx = Math.floor((center.x - rangeX) / this.cellSize);
    const maxCx = Math.floor((center.x + rangeX) / this.cellSize);
    const minCy = Math.floor((center.y - rangeY) / this.cellSize);
    const maxCy = Math.floor((center.y + rangeY) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells.get(positionKey({ x: cx, y: cy, z: center.z }));
        if (!cell) continue;
        for (const player of cell) {
          if (Math.abs(player.position.x - center.x) > rangeX) continue;
          if (Math.abs(player.position.y - center.y) > rangeY) continue;
          found.push(player);
        }
      }
    }
    return found;
  }

  private removeAt(player: Player, position: Position): void {
    const key = this.cellKey(position);
    const cell = this.cells.get(key);
    if (!cell) return;
    cell.delete(player);
    if (cell.size === 0) this.cells.delete(key);
  }
}
