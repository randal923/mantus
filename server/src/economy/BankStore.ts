import type { BankTransferResult } from "./BankOperationResult";

/**
 * Durable bank state. Deposits and withdrawals are memory-first and commit
 * through `EconomyPersistStore`, so only the login read and the
 * cross-character transfer are transactions of their own.
 */
export interface BankStore {
  balance(characterId: string): Promise<number>;
  transfer(
    characterId: string,
    toCharacterName: string,
    amount: number,
  ): Promise<BankTransferResult>;
}
