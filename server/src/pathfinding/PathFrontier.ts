import type { Position } from "@tibia/protocol";

export interface PathFrontierEntry {
  position: Position;
  /** Steps walked from the search start. */
  steps: number;
  /** Estimated steps still to walk; always 0 for a breadth-first search. */
  estimate: number;
}

/**
 * Deterministic open set for `findPath`. Pops the lowest `steps + estimate`
 * first; a guided search then prefers the deeper entry so it walks straight
 * at the goal across open ground instead of sweeping every equally-rated
 * tile, and an unguided one keeps insertion order — plain breadth-first.
 */
export class PathFrontier {
  private readonly entries: Array<PathFrontierEntry & { sequence: number }> =
    [];
  private sequence = 0;

  constructor(private readonly guided: boolean) {}

  get size(): number {
    return this.entries.length;
  }

  push(entry: PathFrontierEntry): void {
    this.entries.push({ ...entry, sequence: this.sequence++ });
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): PathFrontierEntry | undefined {
    const top = this.entries[0];
    const last = this.entries.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.entries.length > 0) {
      this.entries[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.entries.length && this.before(left, smallest)) {
          smallest = left;
        }
        if (right < this.entries.length && this.before(right, smallest)) {
          smallest = right;
        }
        if (smallest === index) break;
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  private before(a: number, b: number): boolean {
    const left = this.entries[a];
    const right = this.entries[b];
    if (!left || !right) return false;
    const leftTotal = left.steps + left.estimate;
    const rightTotal = right.steps + right.estimate;
    if (leftTotal !== rightTotal) return leftTotal < rightTotal;
    if (this.guided && left.steps !== right.steps) {
      return left.steps > right.steps;
    }
    return left.sequence < right.sequence;
  }

  private swap(a: number, b: number): void {
    const left = this.entries[a];
    const right = this.entries[b];
    if (!left || !right) return;
    this.entries[a] = right;
    this.entries[b] = left;
  }
}
