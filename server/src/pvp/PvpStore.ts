/** One durable player-kill row (killer-side view). */
export interface PvpKillRecord {
  readonly victimCharacterId: string;
  readonly occurredAtMs: number;
  readonly unjustified: boolean;
  readonly avenged: boolean;
}

export interface RecordKillInput {
  /** Unique per death event; the durable exactly-once key per killer. */
  readonly deathEventId: string;
  readonly killerCharacterId: string;
  readonly victimCharacterId: string;
  readonly occurredAt: Date;
  readonly unjustified: boolean;
  /**
   * When set, mark the victim's oldest unavenged unjustified kill on this
   * killer at or after the cutoff as avenged (justified-avenge kills).
   */
  readonly avengeCutoff: Date | null;
  /** Present only when this kill transitioned the killer to red/black. */
  readonly sanction: {
    readonly skull: "red" | "black";
    readonly expiresAt: Date;
  } | null;
}

export type RecordKillResult = "recorded" | "duplicate";

/**
 * Durable PVP frag storage. `recordKill` performs the kill row insert, the
 * avenge flag update, and the sanction audit row in ONE transaction; a
 * replayed deathEventId is a no-op reporting "duplicate" (no second frag
 * row, no second audit row).
 */
export interface PvpStore {
  /**
   * Loads the character's killer-side frags inside the month window and
   * prunes anything older in the same call.
   */
  loadFrags(
    characterId: string,
    pruneBefore: Date,
  ): Promise<ReadonlyArray<PvpKillRecord>>;
  recordKill(input: RecordKillInput): Promise<RecordKillResult>;
}
