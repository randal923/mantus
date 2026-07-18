import type { PoolClient } from "pg";
import { lockAccountQuery } from "./sql/lockAccountQuery";

export async function lockAccount(
  client: PoolClient,
  accountId: string,
): Promise<void> {
  const account = await client.query(lockAccountQuery, [accountId]);
  if (account.rowCount !== 1) throw new Error("character account not found");
}
