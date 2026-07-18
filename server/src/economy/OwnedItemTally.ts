/**
 * Running count of a character's owned item rows within one economy
 * transaction. Set once by the owned-items load, then kept in sync as rows
 * are created and deleted so the owned-item cap can be enforced.
 */
export class OwnedItemTally {
  private count: number | null = null;

  load(count: number): void {
    this.count = count;
  }

  current(): number {
    if (this.count === null) {
      throw new Error("economy owned items were not loaded");
    }
    return this.count;
  }

  increment(): void {
    this.count = this.current() + 1;
  }

  decrement(): void {
    this.count = this.current() - 1;
  }
}
