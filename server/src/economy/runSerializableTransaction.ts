import type { Pool, PoolClient } from "pg";
import { isSerializationFailure } from "./isSerializationFailure";
import { beginSerializableTransactionQuery } from "./sql/beginSerializableTransactionQuery";
import { TransactionRollback } from "./TransactionRollback";

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 15;

/**
 * Runs `operation` inside one SERIALIZABLE transaction. A thrown
 * TransactionRollback aborts every mutation and resolves with its result.
 *
 * Serialization aborts (40001) and deadlocks (40P01) are retried up to
 * `MAX_ATTEMPTS` times with a growing backoff, mirroring
 * `item/withSerializableTransaction`: concurrent economy transactions on the
 * same character/item rows abort optimistically and are expected to be re-run.
 * Each attempt is a fresh transaction on a fresh connection, so a retry
 * re-executes every read and every execution-time check against the winner's
 * committed state (charter rule 4).
 *
 * Unlike the item helper this deliberately does NOT retry the broader
 * `isTransientDatabaseError` set (connection resets, 08*): those leave the
 * commit outcome ambiguous, and money legs here are not expected-version
 * guarded, so re-running one could apply a bank/market transfer twice. 40001
 * and 40P01 are guaranteed server-side rollbacks — nothing was applied — so
 * re-running is safe.
 */
export async function runSerializableTransaction<T>(
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
      await client.query(beginSerializableTransactionQuery);
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection may already be gone; the pool discards it below.
        // Swallowing keeps the original cause — not the rollback error — as
        // the outcome, so a TransactionRollback still resolves normally.
      }
      if (cause instanceof TransactionRollback) return cause.result as T;
      if (!isSerializationFailure(cause)) throw cause;
      lastCause = cause;
    } finally {
      client.release();
    }
  }
  throw lastCause;
}
