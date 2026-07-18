import type { PoolClient } from "pg";
import { parseBalance } from "./parseBalance";
import { insertBankAccountQuery } from "./sql/insertBankAccountQuery";
import { selectBankBalanceForUpdateQuery } from "./sql/selectBankBalanceForUpdateQuery";

/** Creates the account row if needed, then locks it and returns the balance. */
export async function lockBankBalance(
  client: PoolClient,
  characterId: string,
): Promise<number> {
  await client.query(insertBankAccountQuery, [characterId]);
  const result = await client.query<{ balance: string }>(
    selectBankBalanceForUpdateQuery,
    [characterId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("bank account is missing");
  return parseBalance(row.balance);
}
