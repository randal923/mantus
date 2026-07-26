export interface DeathHistoryPage {
  readonly entries: ReadonlyArray<{
    readonly at: number;
    readonly level: number;
    readonly cause: string;
  }>;
  readonly totalEntries: number;
}

export interface PvpKillPage {
  readonly entries: ReadonlyArray<{
    readonly at: number;
    readonly victimName: string;
    readonly unjustified: boolean;
  }>;
  readonly totalEntries: number;
}

/**
 * Cyclopedia read models (Feature 83): fixed parameterized queries with row
 * limits and time windows, HighscoreService-style. Death rows are written
 * write-behind from the death path.
 */
export interface CyclopediaStore {
  recordDeath(characterId: string, level: number, cause: string): Promise<void>;
  deathsPage(
    characterId: string,
    page: number,
    pageSize: number,
    windowDays: number,
  ): Promise<DeathHistoryPage>;
  pvpKillsPage(
    characterId: string,
    page: number,
    pageSize: number,
    windowDays: number,
  ): Promise<PvpKillPage>;
}
