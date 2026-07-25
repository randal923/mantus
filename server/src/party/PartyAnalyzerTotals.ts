/**
 * Server-owned hunt-session counters for one online player. Every number is
 * accumulated inside the tick from events the server itself produced (loot it
 * granted, supplies it consumed); the client never reports any of it.
 *
 * Counters live on the `Player` instance, so they start at zero on login and
 * disappear with the player on logout — there is no keyed map to leak.
 */
export class PartyAnalyzerTotals {
  private startedAt: number;
  private lootedByType = new Map<number, number>();
  private suppliesByType = new Map<number, number>();

  constructor(now: number) {
    this.startedAt = now;
  }

  elapsedMs(now: number): number {
    return Math.max(0, now - this.startedAt);
  }

  recordLoot(typeId: number, count: number): void {
    if (count <= 0) return;
    this.lootedByType.set(typeId, (this.lootedByType.get(typeId) ?? 0) + count);
  }

  recordSupply(typeId: number, count: number): void {
    if (count <= 0) return;
    this.suppliesByType.set(
      typeId,
      (this.suppliesByType.get(typeId) ?? 0) + count,
    );
  }

  loot(): ReadonlyMap<number, number> {
    return this.lootedByType;
  }

  supplies(): ReadonlyMap<number, number> {
    return this.suppliesByType;
  }

  reset(now: number): void {
    this.startedAt = now;
    this.lootedByType = new Map();
    this.suppliesByType = new Map();
  }
}
