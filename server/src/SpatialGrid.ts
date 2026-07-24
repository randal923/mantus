import type { Position } from "@tibia/protocol";
import type { Creature } from "./creature/Creature";
import { positionKey } from "./positionKey";

/**
 * Buckets creatures into fixed-size cells so visibility queries touch only the
 * cells overlapping the search box instead of every creature in the world.
 * Coordinates are read at insert time; callers must re-bucket after movement.
 */
export class SpatialGrid {
  private readonly cells = new Map<string, Set<Creature>>();
  private readonly floorCounts = new Map<number, number>();

  constructor(private readonly cellSize = 8) {}

  private cellKey(position: Position): string {
    return positionKey({
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
      z: position.z,
    });
  }

  insert(creature: Creature): void {
    const key = this.cellKey(creature.position);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(creature);
    this.floorCounts.set(
      creature.position.z,
      (this.floorCounts.get(creature.position.z) ?? 0) + 1,
    );
  }

  /** Remove using the creature's current coordinates. */
  remove(creature: Creature): void {
    this.removeAt(creature, creature.position);
  }

  /** Re-bucket after a position change. */
  move(creature: Creature, from: Position): void {
    const fromKey = this.cellKey(from);
    const toKey = this.cellKey(creature.position);
    if (fromKey === toKey) return;
    this.removeAt(creature, from);
    this.insert(creature);
  }

  /** Creatures within the box |px - x| <= rangeX and |py - y| <= rangeY. */
  query(
    center: Position,
    rangeX: number,
    rangeY: number,
  ): Creature[] {
    const found: Creature[] = [];
    const minCx = Math.floor((center.x - rangeX) / this.cellSize);
    const maxCx = Math.floor((center.x + rangeX) / this.cellSize);
    const minCy = Math.floor((center.y - rangeY) / this.cellSize);
    const maxCy = Math.floor((center.y + rangeY) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.cells.get(positionKey({ x: cx, y: cy, z: center.z }));
        if (!cell) continue;
        for (const creature of cell) {
          if (Math.abs(creature.position.x - center.x) > rangeX) continue;
          if (Math.abs(creature.position.y - center.y) > rangeY) continue;
          found.push(creature);
        }
      }
    }
    return found;
  }

  /** Allocation-free exact-tile check for the movement/pathfinding hot path. */
  hasCreatureAt(position: Position): boolean {
    const cell = this.cells.get(this.cellKey(position));
    if (!cell) return false;
    for (const creature of cell) {
      if (
        creature.position.x === position.x &&
        creature.position.y === position.y
      ) {
        return true;
      }
    }
    return false;
  }

  occupiedFloors(): Iterable<number> {
    return this.floorCounts.keys();
  }

  private removeAt(creature: Creature, position: Position): void {
    const key = this.cellKey(position);
    const cell = this.cells.get(key);
    if (!cell) return;
    if (!cell.delete(creature)) return;
    const floorCount = this.floorCounts.get(position.z) ?? 1;
    if (floorCount <= 1) this.floorCounts.delete(position.z);
    else this.floorCounts.set(position.z, floorCount - 1);
    if (cell.size === 0) this.cells.delete(key);
  }
}
