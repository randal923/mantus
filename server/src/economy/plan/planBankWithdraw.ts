import type { BankActionFailedReason } from "@tibia/protocol";
import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemMutation } from "../../item/ItemMutation";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../CurrencyBalance";
import type { EconomyPersistPlan } from "../EconomyPersistPlan";
import { planMoneyGrant } from "../planMoneyGrant";
import { CarriedItemDraft } from "./CarriedItemDraft";

export interface BankWithdrawPlanInput {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
    readonly bankBalance: number;
  };
  readonly amount: number;
}

export type BankWithdrawPlan =
  | {
      readonly status: "planned";
      readonly mutation: ItemMutation;
      readonly persist: EconomyPersistPlan;
      readonly bankBalanceAfter: number;
    }
  | { readonly status: BankActionFailedReason };

/**
 * Plans a withdrawal in memory: the balance falls and the coins appear. Unlike
 * a sale there is no overflow anywhere to put, so coins that will not fit
 * refuse the whole withdrawal.
 */
export function planBankWithdraw(
  input: BankWithdrawPlanInput,
): BankWithdrawPlan {
  if (input.carried.bankBalance < input.amount) {
    return { status: "insufficient-balance" };
  }
  const draft = new CarriedItemDraft(
    input.catalog,
    input.characterId,
    input.carried.items,
    input.carried.capacityMax,
  );
  const grant = planMoneyGrant(input.amount);
  const coinWeight =
    grant.gold * input.catalog.require(GOLD_COIN_TYPE_ID).weight +
    grant.platinum * input.catalog.require(PLATINUM_COIN_TYPE_ID).weight +
    grant.crystal * input.catalog.require(CRYSTAL_COIN_TYPE_ID).weight;
  if (draft.usedWeight() + coinWeight > draft.capacityBudget()) {
    return { status: "no-capacity" };
  }
  const grants = [
    { typeId: CRYSTAL_COIN_TYPE_ID, count: grant.crystal },
    { typeId: PLATINUM_COIN_TYPE_ID, count: grant.platinum },
    { typeId: GOLD_COIN_TYPE_ID, count: grant.gold },
  ];
  for (const leg of grants) {
    if (leg.count === 0) continue;
    if (draft.grantStackable(leg.typeId, leg.count, "bank-withdraw") > 0) {
      return { status: "no-space" };
    }
  }

  const bankBalanceAfter = input.carried.bankBalance - input.amount;
  const built = draft.build();
  return {
    status: "planned",
    mutation: built.mutation,
    persist: {
      carried: built.persist,
      bankOps: [
        {
          characterId: input.characterId,
          delta: -input.amount,
          expectedBalanceAfter: bankBalanceAfter,
          ledger: "withdraw",
        },
      ],
      audits: [
        {
          kind: "bank-withdraw",
          amount: input.amount,
          balanceAfter: bankBalanceAfter,
        },
      ],
    },
    bankBalanceAfter,
  };
}
