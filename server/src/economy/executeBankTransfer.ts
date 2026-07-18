import { BANK_LIMITS } from "@tibia/protocol";
import type { PoolClient } from "pg";
import { appendBankLedger } from "./appendBankLedger";
import type { BankTransferResult } from "./BankOperationResult";
import { creditBankBalance } from "./creditBankBalance";
import { debitBankBalance } from "./debitBankBalance";
import { parseBalance } from "./parseBalance";
import { insertBankAccountPairQuery } from "./sql/insertBankAccountPairQuery";
import { insertBankTransferAuditQuery } from "./sql/insertBankTransferAuditQuery";
import { lockBankAccountPairQuery } from "./sql/lockBankAccountPairQuery";
import { selectRecipientIdQuery } from "./sql/selectRecipientIdQuery";

/** Runs both balance legs of one transfer inside the open transaction. */
export async function executeBankTransfer(
  client: PoolClient,
  characterId: string,
  toCharacterName: string,
  amount: number,
): Promise<BankTransferResult> {
  const recipient = await client.query<{ id: string }>(selectRecipientIdQuery, [
    toCharacterName,
  ]);
  const toCharacterId = recipient.rows[0]?.id;
  if (!toCharacterId) return { status: "recipient-not-found" };
  if (toCharacterId === characterId) return { status: "invalid-recipient" };

  await client.query(insertBankAccountPairQuery, [characterId, toCharacterId]);
  const locked = await client.query<{
    character_id: string;
    balance: string;
  }>(lockBankAccountPairQuery, [characterId, toCharacterId]);
  const balances = new Map(
    locked.rows.map((row) => [row.character_id, parseBalance(row.balance)]),
  );
  const senderBalance = balances.get(characterId);
  const recipientBalance = balances.get(toCharacterId);
  if (senderBalance === undefined || recipientBalance === undefined) {
    throw new Error("bank transfer accounts are missing");
  }
  if (senderBalance < amount) return { status: "insufficient-balance" };
  if (recipientBalance + amount > BANK_LIMITS.maxBalance) {
    return { status: "balance-limit" };
  }
  const balanceAfter = await debitBankBalance(client, characterId, amount);
  const recipientAfter = await creditBankBalance(client, toCharacterId, amount);
  await appendBankLedger(
    client,
    characterId,
    "transfer-out",
    amount,
    balanceAfter,
    toCharacterId,
  );
  await appendBankLedger(
    client,
    toCharacterId,
    "transfer-in",
    amount,
    recipientAfter,
    characterId,
  );
  await client.query(insertBankTransferAuditQuery, [
    characterId,
    amount,
    toCharacterId,
    balanceAfter,
  ]);
  return { status: "committed", balance: balanceAfter, toCharacterId };
}
