import { BANK_LIMITS } from "@tibia/protocol";
import type { PoolClient } from "pg";
import { parseBalance } from "./parseBalance";
import { creditBankBalanceQuery } from "./sql/creditBankBalanceQuery";

export async function creditBankBalance(
  client: PoolClient,
  characterId: string,
  amount: number,
): Promise<number> {
  const result = await client.query<{ balance: string }>(
    creditBankBalanceQuery,
    [characterId, amount, BANK_LIMITS.maxBalance],
  );
  const row = result.rows[0];
  if (!row) throw new Error("bank credit failed");
  return parseBalance(row.balance);
}
