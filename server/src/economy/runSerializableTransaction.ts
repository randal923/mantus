import type { Pool, PoolClient } from "pg";
import { beginSerializableTransactionQuery } from "./sql/beginSerializableTransactionQuery";
import { TransactionRollback } from "./TransactionRollback";

/**
 * Runs `operation` inside one SERIALIZABLE transaction. A thrown
 * TransactionRollback aborts every mutation and resolves with its result.
 */
export async function runSerializableTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(beginSerializableTransactionQuery);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (cause) {
    await client.query("ROLLBACK");
    if (cause instanceof TransactionRollback) return cause.result as T;
    throw cause;
  } finally {
    client.release();
  }
}
