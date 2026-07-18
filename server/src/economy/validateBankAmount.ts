import { BANK_LIMITS } from "@tibia/protocol";

export function validateBankAmount(amount: number): void {
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > BANK_LIMITS.maxTransactionAmount
  ) {
    throw new Error("invalid bank amount");
  }
}
