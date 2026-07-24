import type { Pool, PoolClient } from "pg";
import { isTransientDatabaseError } from "../character/isTransientDatabaseError";
import { beginSerializableCommand } from "./sql/beginSerializableCommand";
import { commitCommand } from "./sql/commitCommand";
import { rollbackCommand } from "./sql/rollbackCommand";

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 15;

/**
 * Test-only crash injection for the process-kill durability harness
 * (`PgItemCrashHarness.integration.test.ts`). Read once at import, so an unset
 * production process pays only a constant comparison. When set to
 * "before-commit" or "after-commit", the process dies abruptly at that
 * transaction boundary via `process.exit(137)` — no rollback, no flush, no
 * graceful shutdown: the OS severs the DB socket mid-transaction, exactly as a
 * SIGKILL would, proving an abrupt death leaves exactly one durable item
 * location. `process.exit` is used over self-SIGKILL because signal delivery
 * to self raced a clean exit and did not survive the `tsx` child boundary.
 */
const CRASH_POINT = process.env.ITEM_TX_CRASH_POINT ?? null;

function crashIfInjected(point: "before-commit" | "after-commit"): void {
  if (CRASH_POINT === point) process.exit(137);
}

/**
 * Runs `operation` in one SERIALIZABLE transaction, retried a bounded number
 * of times on serialization aborts (SQLSTATE 40001 and friends): concurrent
 * transactions on shared rows — a persist locking the character row while a
 * character save updates it — abort optimistically and are expected to be
 * re-run. Kill-time experience awards save the character immediately, so
 * combat produces BURSTS of back-to-back saves; the growing backoff lets a
 * retry land after the burst drains instead of colliding with every queued
 * save. Each attempt is a fresh transaction on a fresh connection, so a retry
 * re-executes every read and guard against the winner's committed state.
 * Non-transient failures (validation, guarded ops that miss) never retry.
 */
export async function withSerializableTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let lastCause: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, RETRY_BACKOFF_MS * attempt);
      });
    }
    const client = await pool.connect();
    try {
      await client.query(beginSerializableCommand);
      const result = await operation(client);
      crashIfInjected("before-commit");
      await client.query(commitCommand);
      crashIfInjected("after-commit");
      return result;
    } catch (cause) {
      try {
        await client.query(rollbackCommand);
      } catch {
        // The connection may already be gone; the pool discards it below.
      }
      if (!isTransientDatabaseError(cause)) throw cause;
      lastCause = cause;
    } finally {
      client.release();
    }
  }
  throw lastCause;
}
