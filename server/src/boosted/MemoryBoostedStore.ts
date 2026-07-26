import type { BoostedSelectionRecord, BoostedStore } from "./BoostedStore";

export class MemoryBoostedStore implements BoostedStore {
  private readonly rows = new Map<string, BoostedSelectionRecord>();
  readonly clearedBossRaceIds: number[] = [];

  async load(day: string): Promise<BoostedSelectionRecord | null> {
    return this.rows.get(day) ?? null;
  }

  async ensure(
    candidate: BoostedSelectionRecord,
  ): Promise<{ record: BoostedSelectionRecord; created: boolean }> {
    const existing = this.rows.get(candidate.day);
    if (existing) return { record: existing, created: false };
    this.rows.set(candidate.day, candidate);
    return { record: candidate, created: true };
  }

  async clearBossSlotsFor(raceId: number): Promise<void> {
    this.clearedBossRaceIds.push(raceId);
  }
}
