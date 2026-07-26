import type {
  CyclopediaStore,
  DeathHistoryPage,
  PvpKillPage,
} from "./CyclopediaStore";

export class MemoryCyclopediaStore implements CyclopediaStore {
  private readonly deaths = new Map<
    string,
    Array<{ at: number; level: number; cause: string }>
  >();
  readonly pvpKills = new Map<
    string,
    Array<{ at: number; victimName: string; unjustified: boolean }>
  >();
  private clock = 1;

  async recordDeath(
    characterId: string,
    level: number,
    cause: string,
  ): Promise<void> {
    const rows = this.deaths.get(characterId) ?? [];
    rows.push({ at: (this.clock += 1), level, cause });
    this.deaths.set(characterId, rows);
  }

  async deathsPage(
    characterId: string,
    page: number,
    pageSize: number,
  ): Promise<DeathHistoryPage> {
    const rows = [...(this.deaths.get(characterId) ?? [])].reverse();
    return {
      entries: rows.slice(page * pageSize, (page + 1) * pageSize),
      totalEntries: rows.length,
    };
  }

  async pvpKillsPage(
    characterId: string,
    page: number,
    pageSize: number,
  ): Promise<PvpKillPage> {
    const rows = [...(this.pvpKills.get(characterId) ?? [])].reverse();
    return {
      entries: rows.slice(page * pageSize, (page + 1) * pageSize),
      totalEntries: rows.length,
    };
  }
}
