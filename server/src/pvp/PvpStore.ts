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
  /**
   * Frags of this killer older than this are dropped in the same transaction.
   * Collecting them here rather than at login keeps world entry read-only, and
   * this is the moment the killer's frag set grew.
   */
  readonly pruneBefore: Date;
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
   * Loads the character's killer-side frags inside the month window. Read-only
   * — this is on the login path, so expired rows are filtered here and
   * collected by `recordKill` instead.
   */
  loadFrags(
    characterId: string,
    since: Date,
  ): Promise<ReadonlyArray<PvpKillRecord>>;
  recordKill(input: RecordKillInput): Promise<RecordKillResult>;
}
