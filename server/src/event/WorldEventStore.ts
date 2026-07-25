/** Durable roll state for one event, as the store returns it on a claim. */
export interface ClaimedWorldEventCheck {
  readonly eventId: string;
  readonly failedAttempts: number;
  readonly checksToday: number;
  readonly triggerWhenPossible: boolean;
  readonly lastOccurrenceAt: Date | null;
  /** Stable per-check identity; the fire's idempotency key is derived from it. */
  readonly checkedAt: Date;
}

export interface WorldEventStore {
  /**
   * Registers the imported events, leaving existing rows (and their roll
   * state) untouched. Safe to call on every boot.
   */
  register(
    eventIds: ReadonlyArray<string>,
    firstCheckAt: Date,
  ): Promise<void>;

  /**
   * Claims every schedule whose next check is due, advancing each deadline by
   * `checkIntervalMs` in the same statement. Two managers racing one schedule
   * therefore produce exactly one claim.
   */
  claimDueChecks(
    now: Date,
    checkIntervalMs: number,
    limit: number,
  ): Promise<ReadonlyArray<ClaimedWorldEventCheck>>;

  /** Persists the roll outcome for a claimed check. */
  recordCheckOutcome(outcome: {
    readonly eventId: string;
    readonly failedAttempts: number;
    readonly checksToday: number;
    readonly triggerWhenPossible: boolean;
    readonly fired: boolean;
  }): Promise<void>;

  /**
   * Starts one run under `idempotencyKey`. False means the key already
   * existed, so another manager (or a replay) already started this run and no
   * spawn or reward may happen a second time.
   */
  beginRun(run: {
    readonly idempotencyKey: string;
    readonly eventId: string;
    readonly trigger: "schedule" | "operator";
    readonly operatorCharacterId?: string;
  }): Promise<boolean>;

  finishRun(idempotencyKey: string): Promise<void>;

  /** Marks runs left over from a previous process as abandoned. */
  abandonStaleRuns(): Promise<number>;

  /** Appends an audited operator action in its own transaction. */
  recordOperatorAction(action: {
    readonly eventId: string;
    readonly operatorCharacterId: string;
    readonly action: "start" | "stop" | "enable" | "disable";
    readonly accepted: boolean;
  }): Promise<void>;

  setEnabled(eventId: string, enabled: boolean): Promise<void>;
}
