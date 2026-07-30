import type { Pool } from "pg";
import type { BankTransferResult } from "./BankOperationResult";
import type { BankStore } from "./BankStore";
import { executeBankTransfer } from "./executeBankTransfer";
import { parseBalance } from "./parseBalance";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { selectBankBalanceQuery } from "./sql/selectBankBalanceQuery";
import { validateBankAmount } from "./validateBankAmount";
import { validateBankCharacterId } from "./validateBankCharacterId";

/**
 * Durable bank state. Deposits and withdrawals touch one character, so they are
 * planned in memory and committed by `PgEconomyPersistOps`; only the login read
 * and the cross-character transfer need a transaction of their own here.
 */
export class PgBankStore implements BankStore {
  constructor(private readonly pool: Pool) {}

  async balance(characterId: string): Promise<number> {
    validateBankCharacterId(characterId);
    const result = await this.pool.query<{ balance: string }>(
      selectBankBalanceQuery,
      [characterId],
    );
    const row = result.rows[0];
    return row ? parseBalance(row.balance) : 0;
  }

  async transfer(
    characterId: string,
    toCharacterName: string,
    amount: number,
  ): Promise<BankTransferResult> {
    validateBankCharacterId(characterId);
    validateBankAmount(amount);
    if (toCharacterName.length < 3 || toCharacterName.length > 20) {
      return { status: "recipient-not-found" };
    }
    return runSerializableTransaction(this.pool, (client) =>
      executeBankTransfer(client, characterId, toCharacterName, amount),
    );
  }
}
