import type { PoolClient } from "pg";
import type { BankLedgerEntryType } from "./BankLedgerEntryType";
import { insertBankLedgerQuery } from "./sql/insertBankLedgerQuery";

export async function appendBankLedger(
  client: PoolClient,
  characterId: string,
  entryType: BankLedgerEntryType,
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
