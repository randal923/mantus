import type { Pool } from "pg";
import type {
  ClaimedWorldEventCheck,
  WorldEventStore,
} from "./WorldEventStore";

interface ClaimRow {
  readonly event_id: string;
  readonly failed_attempts: number;
  readonly checks_today: number;
  readonly checks_day: string | null;
  readonly trigger_when_possible: boolean;
  readonly last_occurrence_at: Date | null;
  readonly checked_at: Date;
}

/**
 * Durable world-event schedules on the database clock. Claiming is one
 * conditional UPDATE that advances the deadline as it returns the row, so the
 * row itself is the lease and two servers racing one schedule fire once.
 */
export class PgWorldEventStore implements WorldEventStore {
  constructor(private readonly pool: Pool) {}

  async register(
    eventIds: ReadonlyArray<string>,
    firstCheckAt: Date,
  ): Promise<void> {
    if (eventIds.length === 0) return;
    await this.pool.query(
      `INSERT INTO world_event_schedules (event_id, next_check_at)
       SELECT unnest($1::varchar[]), $2
       ON CONFLICT (event_id) DO NOTHING`,
      [[...eventIds], firstCheckAt],
    );
  }

  async claimDueChecks(
    now: Date,
    checkIntervalMs: number,
    limit: number,
  ): Promise<ReadonlyArray<ClaimedWorldEventCheck>> {
    const claimed = await this.pool.query<ClaimRow>(
      `WITH due AS (
         SELECT event_id FROM world_event_schedules
         WHERE enabled AND next_check_at <= $1
         ORDER BY next_check_at
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE world_event_schedules AS schedules
       SET next_check_at = $1 + make_interval(secs => $2::double precision),
           checks_today = CASE
             WHEN schedules.checks_day = $1::date THEN schedules.checks_today
             ELSE 0
           END,
           checks_day = $1::date
       FROM due
       WHERE schedules.event_id = due.event_id
       RETURNING schedules.event_id,
                 schedules.failed_attempts,
                 schedules.checks_today,
                 schedules.checks_day,
                 schedules.trigger_when_possible,
                 schedules.last_occurrence_at,
                 $1::timestamptz AS checked_at`,
      [now, checkIntervalMs / 1_000, limit],
    );
    return claimed.rows.map((row) => ({
      eventId: row.event_id,
      failedAttempts: row.failed_attempts,
      checksToday: row.checks_today,
      triggerWhenPossible: row.trigger_when_possible,
      lastOccurrenceAt: row.last_occurrence_at,
      checkedAt: row.checked_at,
    }));
  }

  async recordCheckOutcome(outcome: {
    readonly eventId: string;
    readonly failedAttempts: number;
    readonly checksToday: number;
    readonly triggerWhenPossible: boolean;
    readonly fired: boolean;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE world_event_schedules
       SET failed_attempts = $2,
           checks_today = $3,
           trigger_when_possible = $4,
           last_occurrence_at = CASE WHEN $5 THEN now() ELSE last_occurrence_at END
       WHERE event_id = $1`,
      [
        outcome.eventId,
        outcome.failedAttempts,
        outcome.checksToday,
        outcome.triggerWhenPossible,
        outcome.fired,
      ],
    );
  }

  async beginRun(run: {
    readonly idempotencyKey: string;
    readonly eventId: string;
    readonly trigger: "schedule" | "operator";
    readonly operatorCharacterId?: string;
  }): Promise<boolean> {
    const started = await this.pool.query(
      `WITH inserted AS (
         INSERT INTO world_event_runs (
           idempotency_key, event_id, trigger, operator_character_id
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key, event_id
       ),
       audited AS (
         INSERT INTO audit_log(event_type, character_id, details)
         SELECT
           'world-event-started',
           $4,
           jsonb_build_object(
             'eventId', inserted.event_id,
             'trigger', $3::text,
             'idempotencyKey', inserted.idempotency_key
           )
         FROM inserted
         RETURNING 1
       )
       SELECT count(*)::int AS started FROM inserted`,
      [
        run.idempotencyKey,
        run.eventId,
        run.trigger,
        run.operatorCharacterId ?? null,
      ],
    );
    return (claimedCount(started.rows[0]) ?? 0) > 0;
  }

  async finishRun(idempotencyKey: string): Promise<void> {
    await this.pool.query(
      `UPDATE world_event_runs
       SET status = 'completed', finished_at = now()
       WHERE idempotency_key = $1 AND status = 'running'`,
      [idempotencyKey],
    );
  }

  async abandonStaleRuns(): Promise<number> {
    const abandoned = await this.pool.query(
      `UPDATE world_event_runs
       SET status = 'abandoned', finished_at = now()
       WHERE status = 'running'`,
    );
    return abandoned.rowCount ?? 0;
  }

  async recordOperatorAction(action: {
    readonly eventId: string;
    readonly operatorCharacterId: string;
    readonly action: "start" | "stop" | "enable" | "disable";
    readonly accepted: boolean;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log(event_type, character_id, details)
       VALUES (
         'world-event-operator',
         $1,
         jsonb_build_object(
           'eventId', $2::text,
           'action', $3::text,
           'accepted', $4::boolean
         )
       )`,
      [
        action.operatorCharacterId,
        action.eventId,
        action.action,
        action.accepted,
      ],
    );
  }

  async setEnabled(eventId: string, enabled: boolean): Promise<void> {
    await this.pool.query(
      "UPDATE world_event_schedules SET enabled = $2 WHERE event_id = $1",
      [eventId, enabled],
    );
  }
}

function claimedCount(row: unknown): number | undefined {
  const started = (row as { started?: unknown } | undefined)?.started;
  return typeof started === "number" ? started : undefined;
}
