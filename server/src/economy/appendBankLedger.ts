import type { PoolClient } from "pg";
import { insertBankLedgerQuery } from "./sql/insertBankLedgerQuery";

export async function appendBankLedger(
  client: PoolClient,
  characterId: string,
  entryType: "deposit" | "withdraw" | "transfer-in" | "transfer-out",
  amount: number,
  balanceAfter: number,
  counterpartyCharacterId?: string,
): Promise<void> {
  await client.query(insertBankLedgerQuery, [
    characterId,
    entryType,
    amount,
    balanceAfter,
    counterpartyCharacterId ?? null,
  ]);
}
