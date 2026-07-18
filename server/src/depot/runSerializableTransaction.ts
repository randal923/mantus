import type { Pool, PoolClient } from "pg";
import { TransactionRollback } from "../economy/TransactionRollback";
import { beginSerializableTransaction } from "./sql/beginSerializableTransaction";
import { commitTransaction } from "./sql/commitTransaction";
import { rollbackTransaction } from "./sql/rollbackTransaction";

export async function runSerializableTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(beginSerializableTransaction);
    const result = await operation(client);
    await client.query(commitTransaction);
    return result;
  } catch (cause) {
    await client.query(rollbackTransaction);
    if (cause instanceof TransactionRollback) return cause.result as T;
    throw cause;
  } finally {
    client.release();
  }
}
