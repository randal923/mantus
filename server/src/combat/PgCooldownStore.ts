import type { Pool } from "pg";
import type { CooldownStore, PersistedCooldown } from "./CooldownStore";
import { replaceCooldownsQuery } from "./sql/replaceCooldownsQuery";
import { selectCooldownsQuery } from "./sql/selectCooldownsQuery";

export class PgCooldownStore implements CooldownStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<ReadonlyArray<PersistedCooldown>> {
    const result = await this.pool.query<{
      cooldown_key: string;
      ready_at: string;
      total_ms: number;
    }>(selectCooldownsQuery, [characterId]);
    return result.rows.map((row) => ({
      key: row.cooldown_key,
      readyAt: Number(row.ready_at),
      totalMs: row.total_ms,
    }));
  }

  async replace(
    characterId: string,
    cooldowns: ReadonlyArray<PersistedCooldown>,
  ): Promise<void> {
    await this.pool.query(replaceCooldownsQuery, [
      characterId,
      JSON.stringify(
        cooldowns.map((cooldown) => ({
          cooldown_key: cooldown.key,
          ready_at: cooldown.readyAt,
          total_ms: cooldown.totalMs,
        })),
      ),
    ]);
  }
}
