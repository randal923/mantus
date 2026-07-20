import type { Pool } from "pg";
import type { BestiaryStore } from "./BestiaryStore";
import { selectBestiaryKillsQuery } from "./sql/selectBestiaryKillsQuery";
import { upsertBestiaryKillQuery } from "./sql/upsertBestiaryKillQuery";

export class PgBestiaryStore implements BestiaryStore {
  constructor(private readonly pool: Pool) {}

  async loadKills(characterId: string): Promise<ReadonlyMap<number, number>> {
    const result = await this.pool.query<{
      race_id: number;
      kills: string | number;
    }>(selectBestiaryKillsQuery, [characterId]);
    const kills = new Map<number, number>();
    for (const row of result.rows) {
      kills.set(row.race_id, Number(row.kills));
    }
    return kills;
  }

  async addKills(
    characterId: string,
    raceId: number,
    amount: number,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error("bestiary kill amount must be a positive integer");
    }
    await this.pool.query(upsertBestiaryKillQuery, [
      characterId,
      raceId,
      amount,
    ]);
  }
}
