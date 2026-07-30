import { BANK_LIMITS, type BankActionFailedReason } from "@tibia/protocol";
import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemMutation } from "../../item/ItemMutation";
import { countCarriedCoins } from "../countCarriedCoins";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../CurrencyBalance";
import type { EconomyPersistPlan } from "../EconomyPersistPlan";
import { planMoneySpend } from "../planMoneySpend";
import { CarriedItemDraft } from "./CarriedItemDraft";

export interface BankDepositPlanInput {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
    readonly bankBalance: number;
  };
  readonly amount: number;
}

export type BankDepositPlan =
  | {
      readonly status: "planned";
      readonly mutation: ItemMutation;
      readonly persist: EconomyPersistPlan;
      readonly bankBalanceAfter: number;
    }
  | { readonly status: BankActionFailedReason };

/** Plans a deposit in memory: coins leave, change returns, balance rises. */
export function planBankDeposit(
  input: BankDepositPlanInput,
): BankDepositPlan {
  const bankBalanceAfter = input.carried.bankBalance + input.amount;
  if (bankBalanceAfter > BANK_LIMITS.maxBalance) {
    return { status: "balance-limit" };
  }
  const draft = new CarriedItemDraft(
    input.catalog,
    input.characterId,
    input.carried.items,
    input.carried.capacityMax,
  );
  const spend = planMoneySpend(countCarriedCoins(draft.items()), input.amount);
  if (!spend) return { status: "insufficient-funds" };
  const spends = [
    { typeId: GOLD_COIN_TYPE_ID, count: spend.goldSpent },
    { typeId: PLATINUM_COIN_TYPE_ID, count: spend.platinumSpent },
    { typeId: CRYSTAL_COIN_TYPE_ID, count: spend.crystalSpent },
  ];
  for (const leg of spends) {
    if (leg.count === 0) continue;
    if (!draft.destroy(leg.typeId, leg.count, "bank-deposit")) {
      return { status: "insufficient-funds" };
    }
  }
  const change = [
    { typeId: GOLD_COIN_TYPE_ID, count: spend.goldChange },
    { typeId: PLATINUM_COIN_TYPE_ID, count: spend.platinumChange },
  ];
  for (const leg of change) {
    if (leg.count === 0) continue;
    if (
      draft.grantStackable(leg.typeId, leg.count, "bank-deposit-change") > 0
    ) {
      return { status: "no-space" };
    }
  }

  const built = draft.build();
  return {
    status: "planned",
    mutation: built.mutation,
    persist: {
      carried: built.persist,
      bankOps: [
        {
          characterId: input.characterId,
          delta: input.amount,
          expectedBalanceAfter: bankBalanceAfter,
          ledger: "deposit",
        },
      ],
      audits: [
        {
          kind: "bank-deposit",
          amount: input.amount,
          balanceAfter: bankBalanceAfter,
        },
      ],
    },
    bankBalanceAfter,
  };
}
