import type { Pool } from "pg";
import type { BoostedSelectionRecord, BoostedStore } from "./BoostedStore";
import { clearBoostedBossSlotsQuery } from "./sql/clearBoostedBossSlotsQuery";
import { insertBoostedDayQuery } from "./sql/insertBoostedDayQuery";
import { selectBoostedDayQuery } from "./sql/selectBoostedDayQuery";

interface BoostedRow {
  day: string;
  creature_race_id: number;
  creature_name: string;
  boss_race_id: number | null;
  boss_name: string | null;
}

export class PgBoostedStore implements BoostedStore {
  constructor(private readonly pool: Pool) {}

  async load(day: string): Promise<BoostedSelectionRecord | null> {
    const result = await this.pool.query<BoostedRow>(selectBoostedDayQuery, [
      day,
    ]);
    const row = result.rows[0];
    return row ? this.parse(row) : null;
  }

  async ensure(
    candidate: BoostedSelectionRecord,
  ): Promise<{ record: BoostedSelectionRecord; created: boolean }> {
    const inserted = await this.pool.query(insertBoostedDayQuery, [
      candidate.day,
      candidate.creatureRaceId,
      candidate.creatureName,
      candidate.bossRaceId,
      candidate.bossName,
    ]);
    const created = (inserted.rowCount ?? 0) > 0;
    if (created) return { record: candidate, created };
    const stored = await this.load(candidate.day);
    if (!stored) {
      throw new Error(`boosted selection for ${candidate.day} vanished`);
    }
    return { record: stored, created: false };
  }

  async clearBossSlotsFor(raceId: number): Promise<void> {
    await this.pool.query(clearBoostedBossSlotsQuery, [raceId]);
  }

  private parse(row: BoostedRow): BoostedSelectionRecord {
    return {
      day: row.day,
      creatureRaceId: row.creature_race_id,
      creatureName: row.creature_name,
      bossRaceId: row.boss_race_id,
      bossName: row.boss_name,
    };
  }
}
