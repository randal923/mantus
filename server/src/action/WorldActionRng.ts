/**
 * Seeded RNG for world-action outcomes (chest random rewards, tool catch
 * rolls). Every roll happens here, server-side inside the tick: the client
 * never supplies or influences a random value (charter rule 1).
 */
export class WorldActionRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e37_79b9;
  }

  /** True with `percent` probability; 0 never fires, 100 always does. */
  chance(percent: number): boolean {
    if (percent <= 0) return false;
    if (percent >= 100) return true;
    return this.next() * 100 < percent;
  }

  /** Uniform integer in [minimum, maximum]. */
  integer(minimum: number, maximum: number): number {
    const lower = Math.ceil(Math.min(minimum, maximum));
    const upper = Math.floor(Math.max(minimum, maximum));
    if (upper <= lower) return lower;
    return lower + Math.floor(this.next() * (upper - lower + 1));
  }

  /** One element of a non-empty list. */
  pick<T>(values: ReadonlyArray<T>): T {
    const chosen = values[this.integer(0, values.length - 1)];
    if (chosen === undefined) throw new Error("cannot pick from an empty list");
    return chosen;
  }

  private next(): number {
    this.state = (this.state + 0x6d2b_79f5) | 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}
