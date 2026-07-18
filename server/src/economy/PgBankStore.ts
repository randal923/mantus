import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import type {
  BankDepositResult,
  BankTransferResult,
  BankWithdrawResult,
} from "./BankOperationResult";
import type { BankStore } from "./BankStore";
import { executeBankDeposit } from "./executeBankDeposit";
import { executeBankTransfer } from "./executeBankTransfer";
import { executeBankWithdraw } from "./executeBankWithdraw";
import { parseBalance } from "./parseBalance";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { selectBankBalanceQuery } from "./sql/selectBankBalanceQuery";
import { validateBankAmount } from "./validateBankAmount";
import { validateBankCharacterId } from "./validateBankCharacterId";

export class PgBankStore implements BankStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async balance(characterId: string): Promise<number> {
    validateBankCharacterId(characterId);
    const result = await this.pool.query<{ balance: string }>(
      selectBankBalanceQuery,
      [characterId],
    );
    const row = result.rows[0];
    return row ? parseBalance(row.balance) : 0;
  }

  async deposit(
    characterId: string,
    amount: number,
  ): Promise<BankDepositResult> {
    validateBankCharacterId(characterId);
    validateBankAmount(amount);
    return runSerializableTransaction(this.pool, (client) =>
      executeBankDeposit(client, characterId, amount, this.catalog),
    );
  }

  async withdraw(
    characterId: string,
    amount: number,
  ): Promise<BankWithdrawResult> {
    validateBankCharacterId(characterId);
    validateBankAmount(amount);
    return runSerializableTransaction(this.pool, (client) =>
      executeBankWithdraw(client, characterId, amount, this.catalog),
    );
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
