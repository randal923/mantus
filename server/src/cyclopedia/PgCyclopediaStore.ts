import type { Pool } from "pg";
import { countDeathsQuery } from "./sql/countDeathsQuery";
import { countPvpKillsQuery } from "./sql/countPvpKillsQuery";
import { insertDeathQuery } from "./sql/insertDeathQuery";
import { selectDeathsQuery } from "./sql/selectDeathsQuery";
import { selectPvpKillsQuery } from "./sql/selectPvpKillsQuery";
import type {
  CyclopediaStore,
  DeathHistoryPage,
  PvpKillPage,
} from "./CyclopediaStore";

export class PgCyclopediaStore implements CyclopediaStore {
  constructor(private readonly pool: Pool) {}

  async recordDeath(
    characterId: string,
    level: number,
    cause: string,
  ): Promise<void> {
    await this.pool.query(insertDeathQuery, [characterId, level, cause]);
  }

  async deathsPage(
    characterId: string,
    page: number,
    pageSize: number,
    windowDays: number,
  ): Promise<DeathHistoryPage> {
    const [rows, total] = await Promise.all([
      this.pool.query<{
        level: number;
        cause: string;
        occurred_at_ms: string;
      }>(selectDeathsQuery, [characterId, pageSize, page * pageSize, windowDays]),
      this.pool.query<{ total: number }>(countDeathsQuery, [
        characterId,
        windowDays,
      ]),
    ]);
    return {
      entries: rows.rows.map((row) => ({
        at: Number(row.occurred_at_ms),
        level: row.level,
        cause: row.cause,
      })),
      totalEntries: total.rows[0]?.total ?? 0,
    };
  }

  async pvpKillsPage(
    characterId: string,
    page: number,
    pageSize: number,
    windowDays: number,
  ): Promise<PvpKillPage> {
    const [rows, total] = await Promise.all([
      this.pool.query<{
        victim_name: string;
        unjustified: boolean;
        occurred_at_ms: string;
      }>(selectPvpKillsQuery, [
        characterId,
        pageSize,
        page * pageSize,
        windowDays,
      ]),
      this.pool.query<{ total: number }>(countPvpKillsQuery, [
        characterId,
        windowDays,
      ]),
    ]);
    return {
      entries: rows.rows.map((row) => ({
        at: Number(row.occurred_at_ms),
        victimName: row.victim_name,
        unjustified: row.unjustified,
      })),
      totalEntries: total.rows[0]?.total ?? 0,
    };
  }
}
