import type { PoolClient } from "pg";
import {
  creditGuildBalanceQuery,
  debitGuildBalanceQuery,
  insertGuildBankAuditQuery,
  insertGuildBankLedgerQuery,
  lockGuildBalanceQuery,
} from "./sql/guildBankQueries";

/** Locks the guild row so racing balance mutations serialize on it. */
export async function lockGuildBalance(
  client: PoolClient,
  guildId: string,
): Promise<number> {
  const locked = await client.query<{ balance: string }>(
    lockGuildBalanceQuery,
    [guildId],
  );
  const row = locked.rows[0];
  if (!row) throw new Error("guild row is missing");
  return Number(row.balance);
}

export async function creditGuildBalance(
  client: PoolClient,
  guildId: string,
  amount: number,
): Promise<number> {
  const credited = await client.query<{ balance: string }>(
    creditGuildBalanceQuery,
    [guildId, amount],
  );
  const row = credited.rows[0];
  if (!row) throw new Error("guild credit failed");
  return Number(row.balance);
}

/** Null when the guild could not cover `amount`; nothing was written. */
export async function debitGuildBalance(
  client: PoolClient,
  guildId: string,
  amount: number,
): Promise<number | null> {
  const debited = await client.query<{ balance: string }>(
    debitGuildBalanceQuery,
    [guildId, amount],
  );
  const row = debited.rows[0];
  return row ? Number(row.balance) : null;
}

/** One guild ledger row plus its economy audit row (charter rule 11). */
export async function recordGuildBankEntry(
  client: PoolClient,
  entry: {
    readonly guildId: string;
    readonly characterId: string | null;
    readonly entryType:
      | "deposit"
      | "withdraw"
      | "war-stake"
      | "war-payout"
      | "war-refund"
      | "guildhall-purchase"
      | "guildhall-rent";
    readonly auditType:
      | "guild-deposit"
      | "guild-withdraw"
      | "guild-war-stake"
      | "guild-war-payout";
    readonly amount: number;
    readonly balanceAfter: number;
  },
): Promise<void> {
  await client.query(insertGuildBankLedgerQuery, [
    entry.guildId,
    entry.characterId,
    entry.entryType,
    entry.amount,
    entry.balanceAfter,
  ]);
  await client.query(insertGuildBankAuditQuery, [
    entry.auditType,
    entry.characterId,
    entry.guildId,
    entry.amount,
    entry.balanceAfter,
  ]);
}
