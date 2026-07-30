export type BankTransferResult =
  | {
      status: "committed";
      balance: number;
      toCharacterId: string;
      /** The recipient's own balance, pushed to them if they are online. */
      toBalance: number;
    }
  | { status: "insufficient-balance" }
  | { status: "recipient-not-found" }
  | { status: "invalid-recipient" }
  | { status: "balance-limit" };
