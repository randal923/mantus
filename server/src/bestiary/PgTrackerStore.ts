import type { Pool } from "pg";
import { deleteTrackerQuery } from "./sql/deleteTrackerQuery";
import { selectTrackersQuery } from "./sql/selectTrackersQuery";
import { upsertTrackerQuery } from "./sql/upsertTrackerQuery";
import type { TrackerSnapshot, TrackerStore } from "./TrackerStore";

export class PgTrackerStore implements TrackerStore {
  constructor(private readonly pool: Pool) {}

  async load(characterId: string): Promise<TrackerSnapshot> {
    const result = await this.pool.query<{ scope: string; race_id: number }>(
      selectTrackersQuery,
      [characterId],
    );
    const bestiary: number[] = [];
    const bosstiary: number[] = [];
    for (const row of result.rows) {
      (row.scope === "bosstiary" ? bosstiary : bestiary).push(row.race_id);
    }
    return { bestiary, bosstiary };
  }

  async set(
    characterId: string,
    scope: "bestiary" | "bosstiary",
    raceId: number,
    enabled: boolean,
  ): Promise<void> {
    await this.pool.query(enabled ? upsertTrackerQuery : deleteTrackerQuery, [
      characterId,
      scope,
      raceId,
    ]);
  }
}
