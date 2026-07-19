import type {
  PvpKillRecord,
  PvpStore,
  RecordKillInput,
  RecordKillResult,
} from "./PvpStore";

interface MemoryKillRow {
  deathEventId: string;
  killerCharacterId: string;
  victimCharacterId: string;
  occurredAtMs: number;
  unjustified: boolean;
  avenged: boolean;
}

/** In-memory PvpStore test double mirroring PgPvpStore semantics. */
export class MemoryPvpStore implements PvpStore {
  private readonly rows: MemoryKillRow[] = [];
  readonly sanctionAudits: Array<{
    characterId: string;
    skull: "red" | "black";
    deathEventId: string;
  }> = [];

  async loadFrags(
    characterId: string,
    pruneBefore: Date,
  ): Promise<ReadonlyArray<PvpKillRecord>> {
    const cutoff = pruneBefore.getTime();
    for (let index = this.rows.length - 1; index >= 0; index--) {
      const row = this.rows[index];
      if (row && row.occurredAtMs < cutoff) this.rows.splice(index, 1);
    }
    return this.rows
      .filter((row) => row.killerCharacterId === characterId)
      .map((row) => ({
        victimCharacterId: row.victimCharacterId,
        occurredAtMs: row.occurredAtMs,
        unjustified: row.unjustified,
        avenged: row.avenged,
      }));
  }

  async recordKill(input: RecordKillInput): Promise<RecordKillResult> {
    const duplicate = this.rows.some(
      (row) =>
        row.deathEventId === input.deathEventId &&
        row.killerCharacterId === input.killerCharacterId,
    );
    if (duplicate) return "duplicate";
    this.rows.push({
      deathEventId: input.deathEventId,
      killerCharacterId: input.killerCharacterId,
      victimCharacterId: input.victimCharacterId,
      occurredAtMs: input.occurredAt.getTime(),
      unjustified: input.unjustified,
      avenged: false,
    });
    if (input.avengeCutoff) {
      const cutoff = input.avengeCutoff.getTime();
      const reverse = this.rows
        .filter(
          (row) =>
            row.killerCharacterId === input.victimCharacterId &&
            row.victimCharacterId === input.killerCharacterId &&
            row.unjustified &&
            !row.avenged &&
            row.occurredAtMs >= cutoff,
        )
        .sort((left, right) => left.occurredAtMs - right.occurredAtMs)[0];
      if (reverse) reverse.avenged = true;
    }
    if (input.sanction) {
      this.sanctionAudits.push({
        characterId: input.killerCharacterId,
        skull: input.sanction.skull,
        deathEventId: input.deathEventId,
      });
    }
    return "recorded";
  }

  killRowCount(): number {
    return this.rows.length;
  }
}
