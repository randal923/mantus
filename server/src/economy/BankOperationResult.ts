import type { ItemMutation } from "../item/ItemMutation";

export type BankDepositResult =
  | { status: "committed"; balance: number; mutation: ItemMutation }
  | { status: "insufficient-funds" }
  | { status: "balance-limit" };

export type BankWithdrawResult =
  | { status: "committed"; balance: number; mutation: ItemMutation }
  | { status: "insufficient-balance" }
  | { status: "no-space" };

export type BankTransferResult =
  | { status: "committed"; balance: number; toCharacterId: string }
  | { status: "insufficient-balance" }
  | { status: "recipient-not-found" }
  | { status: "invalid-recipient" }
  | { status: "balance-limit" };
