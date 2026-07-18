import type { PoolClient } from "pg";
import { parseBalance } from "./parseBalance";
import { debitBankBalanceQuery } from "./sql/debitBankBalanceQuery";

export async function debitBankBalance(
  client: PoolClient,
  characterId: string,
  amount: number,
): Promise<number> {
  const result = await client.query<{ balance: string }>(
    debitBankBalanceQuery,
    [characterId, amount],
  );
  const row = result.rows[0];
  if (!row) throw new Error("bank debit failed");
  return parseBalance(row.balance);
}
