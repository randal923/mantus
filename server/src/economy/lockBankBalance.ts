import type { PoolClient } from "pg";
import { parseBalance } from "./parseBalance";
import { lockBankBalanceQuery } from "./sql/lockBankBalanceQuery";

/** Creates the account row if needed, then locks it and returns the balance. */
export async function lockBankBalance(
  client: PoolClient,
  characterId: string,
): Promise<number> {
  const result = await client.query<{ balance: string }>(
    lockBankBalanceQuery,
    [characterId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("bank account is missing");
  return parseBalance(row.balance);
}
