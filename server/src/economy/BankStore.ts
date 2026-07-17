import type {
  BankDepositResult,
  BankTransferResult,
  BankWithdrawResult,
} from "./BankOperationResult";

export interface BankStore {
  balance(characterId: string): Promise<number>;
  deposit(characterId: string, amount: number): Promise<BankDepositResult>;
  withdraw(characterId: string, amount: number): Promise<BankWithdrawResult>;
  transfer(
    characterId: string,
    toCharacterName: string,
    amount: number,
  ): Promise<BankTransferResult>;
}
