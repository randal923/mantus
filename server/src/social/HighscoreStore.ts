import type { CharacterVocation, HighscoreCategory } from "@tibia/protocol";

/** One public ranking row (rank is assigned by the service). */
export interface HighscoreRowRecord {
  readonly name: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
  readonly value: number;
}

export interface HighscorePageRecord {
  /** Total matching rows, already capped at the maximum ranking depth. */
  readonly totalEntries: number;
  readonly rows: ReadonlyArray<HighscoreRowRecord>;
}

/**
 * Bounded highscore read model: one fixed, parameterized query per
 * category, never deeper than the protocol's hard page bound, exposing
 * only public fields (name, level, vocation, ranked value).
 */
export interface HighscoreStore {
  loadPage(input: {
    category: HighscoreCategory;
    vocation: CharacterVocation | null;
    page: number;
  }): Promise<HighscorePageRecord>;
}
