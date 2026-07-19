import type { Pool } from "pg";
import type {
  PvpKillRecord,
  PvpStore,
  RecordKillInput,
  RecordKillResult,
} from "./PvpStore";
import { insertCharacterKillQuery } from "./sql/insertCharacterKillQuery";
import { insertSkullSanctionAuditQuery } from "./sql/insertSkullSanctionAuditQuery";
import { killsByKillerQuery } from "./sql/killsByKillerQuery";
import { markKillAvengedQuery } from "./sql/markKillAvengedQuery";
import { pruneCharacterKillsQuery } from "./sql/pruneCharacterKillsQuery";

interface KillRow {
  victim_character_id: string;
  occurred_at: Date;
  unjustified: boolean;
  avenged: boolean;
}

export class PgPvpStore implements PvpStore {
  constructor(private readonly pool: Pool) {}

  async loadFrags(
    characterId: string,
    pruneBefore: Date,
  ): Promise<ReadonlyArray<PvpKillRecord>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(pruneCharacterKillsQuery, [characterId, pruneBefore]);
      const result = await client.query<KillRow>(killsByKillerQuery, [
        characterId,
      ]);
      await client.query("COMMIT");
      return result.rows.map((row) => ({
        victimCharacterId: row.victim_character_id,
        occurredAtMs: row.occurred_at.getTime(),
        unjustified: row.unjustified,
        avenged: row.avenged,
      }));
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }

  async recordKill(input: RecordKillInput): Promise<RecordKillResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(insertCharacterKillQuery, [
        input.deathEventId,
        input.killerCharacterId,
        input.victimCharacterId,
        input.occurredAt,
        input.unjustified,
      ]);
      if (inserted.rowCount !== 1) {
        // Replayed death event: the frag, avenge, and audit legs already
        // committed together the first time — do none of them again.
        await client.query("ROLLBACK");
        return "duplicate";
      }
      if (input.avengeCutoff) {
        await client.query(markKillAvengedQuery, [
          input.victimCharacterId,
          input.killerCharacterId,
          input.avengeCutoff,
        ]);
      }
      if (input.sanction) {
        await client.query(insertSkullSanctionAuditQuery, [
          input.killerCharacterId,
          JSON.stringify({
            skull: input.sanction.skull,
            expiresAt: input.sanction.expiresAt.toISOString(),
            deathEventId: input.deathEventId,
            victimCharacterId: input.victimCharacterId,
          }),
        ]);
      }
      await client.query("COMMIT");
      return "recorded";
    } catch (cause) {
      await client.query("ROLLBACK");
      throw cause;
    } finally {
      client.release();
    }
  }
}
