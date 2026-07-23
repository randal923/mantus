import type { PoolClient } from "pg";
import { parseBalance } from "./parseBalance";
import { debitShopBankWithLedgerQuery } from "./sql/debitShopBankWithLedgerQuery";

/** Debits shop funds and appends the matching bank ledger row atomically. */
export async function debitShopBankBalance(
  client: PoolClient,
  characterId: string,
  amount: number,
): Promise<number> {
  const result = await client.query<{ balance: string }>(
    debitShopBankWithLedgerQuery,
    [characterId, amount],
  );
  const row = result.rows[0];
  if (!row) throw new Error("shop bank debit failed");
  return parseBalance(row.balance);
}
