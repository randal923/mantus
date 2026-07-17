import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";

export const BANK_LIMITS = {
  /** Largest single deposit/withdraw/transfer the server will consider. */
  maxTransactionAmount: 1_000_000_000_000,
  /** Server-enforced balance ceiling; keeps all balance math in safe integers. */
  maxBalance: 1_000_000_000_000_000,
} as const;

const npcReferenceSchema = z.string().min(1).max(192);

const bankAmountSchema = z
  .number()
  .int()
  .positive()
  .max(BANK_LIMITS.maxTransactionAmount);

const bankBalanceSchema = z
  .number()
  .int()
  .min(0)
  .max(BANK_LIMITS.maxBalance);

/** Deposits carried coins; the server recounts money and range at execution. */
export const bankDepositMessageSchema = z
  .object({
    type: z.literal("bank-deposit"),
    npcId: npcReferenceSchema,
    amount: bankAmountSchema,
  })
  .strict();

/** Withdraws balance as coins; slots and capacity are re-checked at execution. */
export const bankWithdrawMessageSchema = z
  .object({
    type: z.literal("bank-withdraw"),
    npcId: npcReferenceSchema,
    amount: bankAmountSchema,
  })
  .strict();

/** Transfers balance to another character resolved server-side by name. */
export const bankTransferMessageSchema = z
  .object({
    type: z.literal("bank-transfer"),
    npcId: npcReferenceSchema,
    toCharacterName: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    amount: bankAmountSchema,
  })
  .strict();

export const bankOpenedMessageSchema = z
  .object({
    type: z.literal("bank-opened"),
    npcId: npcReferenceSchema,
    npcName: z.string().min(1).max(100),
    balance: bankBalanceSchema,
  })
  .strict();

export const bankUpdatedMessageSchema = z
  .object({
    type: z.literal("bank-updated"),
    balance: bankBalanceSchema,
  })
  .strict();

export const bankActionFailedMessageSchema = z
  .object({
    type: z.literal("bank-action-failed"),
    reason: z.enum([
      "insufficient-funds",
      "insufficient-balance",
      "no-space",
      "no-capacity",
      "recipient-not-found",
      "invalid-recipient",
      "balance-limit",
      "busy",
      "out-of-range",
      "failed",
    ]),
  })
  .strict();

export type BankDepositMessage = z.infer<typeof bankDepositMessageSchema>;
export type BankWithdrawMessage = z.infer<typeof bankWithdrawMessageSchema>;
export type BankTransferMessage = z.infer<typeof bankTransferMessageSchema>;
export type BankOpenedMessage = z.infer<typeof bankOpenedMessageSchema>;
export type BankUpdatedMessage = z.infer<typeof bankUpdatedMessageSchema>;
export type BankActionFailedMessage = z.infer<
  typeof bankActionFailedMessageSchema
>;
export type BankActionFailedReason = BankActionFailedMessage["reason"];
