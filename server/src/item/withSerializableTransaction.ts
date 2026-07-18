import type { Pool, PoolClient } from "pg";
import { beginSerializableCommand } from "./sql/beginSerializableCommand";
import { commitCommand } from "./sql/commitCommand";
import { rollbackCommand } from "./sql/rollbackCommand";

export async function withSerializableTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(beginSerializableCommand);
    const result = await operation(client);
    await client.query(commitCommand);
    return result;
  } catch (cause) {
    await client.query(rollbackCommand);
    throw cause;
  } finally {
    client.release();
  }
}
