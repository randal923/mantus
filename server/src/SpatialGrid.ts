import type { Player } from "./Player";

/**
 * Buckets players into fixed-size cells so visibility queries touch only the
 * cells overlapping the search box instead of every player in the world.
 * Coordinates are read from the player at insert time; callers must re-bucket
 * via move() whenever a player's position changes.
 */
export class SpatialGrid {
  private readonly cells = new Map<string, Set<Player>>();

  constructor(private readonly cellSize = 8) {}

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(player: Player): void {
    const key = this.cellKey(player.x, player.y);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(player);
  }

  /** Remove using the player's current coordinates. */
  remove(player: Player): void {
    this.removeAt(player, player.x, player.y);
  }

  /** Re-bucket after a position change; fromX/fromY are the old coordinates. */
  move(player: Player, fromX: number, fromY: number): void {
    const fromKey = this.cellKey(fromX, fromY);
    const toKey = this.cellKey(player.x, player.y);
    if (fromKey === toKey) return;
    this.removeAt(player, fromX, fromY);
    this.insert(player);
  }

  /** Players within the box |px - x| <= rangeX and |py - y| <= rangeY. */
  query(x: number, y: number, rangeX: number, rangeY: number): Player[] {
    const found: Player[] = [];
    const minCx = Math.floor((x - rangeX) / this.cellSize);
    const maxCx = Math.floor((x + rangeX) / this.cellSize);
    const minCy = Math.floor((y - rangeY) / this.cellSize);
    const maxCy = Math.floor((y + rangeY) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (!cell) continue;
        for (const player of cell) {
          if (Math.abs(player.x - x) > rangeX) continue;
          if (Math.abs(player.y - y) > rangeY) continue;
          found.push(player);
        }
      }
    }
    return found;
  }

  private removeAt(player: Player, x: number, y: number): void {
    const key = this.cellKey(x, y);
    const cell = this.cells.get(key);
    if (!cell) return;
    cell.delete(player);
    if (cell.size === 0) this.cells.delete(key);
  }
}
