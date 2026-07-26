export interface BoostedSelectionRecord {
  /** Server-local `YYYY-MM-DD`; the primary key of the selection. */
  readonly day: string;
  readonly creatureRaceId: number;
  readonly creatureName: string;
  readonly bossRaceId: number | null;
  readonly bossName: string | null;
}

/**
 * Durable daily boost selection. `ensure` is the exactly-once primitive: it
 * inserts the candidate row and returns whatever row owns the day, so racing
 * processes converge on one selection (the row is the selection).
 */
export interface BoostedStore {
  load(day: string): Promise<BoostedSelectionRecord | null>;
  ensure(
    candidate: BoostedSelectionRecord,
  ): Promise<{ record: BoostedSelectionRecord; created: boolean }>;
  /** Rotation side effect: unslot the new boosted boss everywhere. */
  clearBossSlotsFor(raceId: number): Promise<void>;
}
