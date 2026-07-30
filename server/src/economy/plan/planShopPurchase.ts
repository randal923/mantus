import type { ShopActionFailedReason } from "@tibia/protocol";
import type { Item } from "../../item/Item";
import type { ItemCatalog } from "../../item/ItemCatalog";
import type { ItemMutation } from "../../item/ItemMutation";
import { countCarriedCoins } from "../countCarriedCoins";
import { countMoneyWorth } from "../countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "../CurrencyBalance";
import type { EconomyPersistPlan } from "../EconomyPersistPlan";
import { planMoneySpend } from "../planMoneySpend";
import type { ShopItemSubtype } from "../ShopStore";
import { shopSubtypeAttributes } from "../shopSubtypeAttributes";
import { CarriedItemDraft } from "./CarriedItemDraft";

export interface ShopPurchasePlanInput {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly carried: {
    readonly items: ReadonlyArray<Item>;
    readonly capacityMax: number;
    readonly bankBalance: number;
  };
  readonly npcTypeId: string;
  readonly shopId: string;
  readonly offerId: string;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly subtype?: ShopItemSubtype;
  /** Absent ⇒ the shop deals in ordinary money (gold/platinum/crystal). */
  readonly currencyItemTypeId?: number;
  /** Absent ⇒ the offer is unlimited. */
  readonly stock?: { readonly initial: number; readonly remaining: number };
}

export type ShopPurchasePlan =
  | {
      readonly status: "planned";
      readonly mutation: ItemMutation;
      readonly persist: EconomyPersistPlan;
      /** Part of the cost taken from the bank rather than carried coins. */
      readonly bankSpent: number;
      readonly bankBalanceAfter: number;
      readonly stockRemaining?: number;
    }
  | { readonly status: ShopActionFailedReason };

/**
 * Plans one purchase entirely in memory: money leaves, change and goods
 * arrive, and the durable legs are collected for a single transaction behind
 * the tick. Canary computes a purchase the same way — in memory, with the
 * database seeing it only afterwards.
 *
 * Ordinary money is paid from carried coins first and the shortfall from the
 * bank, matching what the DB-first path did and what Canary's merchant does
 * (`getMoney() + getBankBalance()`).
 */
export function planShopPurchase(
  input: ShopPurchasePlanInput,
): ShopPurchasePlan {
  const totalCost = input.unitPrice * input.amount;
  if (!Number.isSafeInteger(totalCost) || totalCost < 0) {
    return { status: "invalid-item" };
  }
  if (input.stock && input.stock.remaining < input.amount) {
    return { status: "out-of-stock" };
  }
  const type = input.catalog.require(input.itemTypeId);
  const draft = new CarriedItemDraft(
    input.catalog,
    input.characterId,
    input.carried.items,
    input.carried.capacityMax,
  );

  const payment = payFor(draft, input, totalCost);
  if (payment.status !== "paid") return { status: payment.status };

  // Weight is judged before slots so an overloaded player is told they cannot
  // carry it rather than that the bag is full, matching the old precheck. The
  // draft already reflects the coins that left and the change that arrived, so
  // adding the goods weight gives the exact final load.
  if (
    draft.usedWeight() + type.weight * input.amount >
    draft.capacityBudget()
  ) {
    return { status: "no-capacity" };
  }
  const attributes = shopSubtypeAttributes(input.subtype);
  const granted = type.stackable
    ? draft.grantStackable(
        input.itemTypeId,
        input.amount,
        "shop-purchase",
        attributes,
      ) === 0
    : draft.grantSingles(
        input.itemTypeId,
        input.amount,
        "shop-purchase",
        attributes,
      );
  if (!granted) return { status: "no-space" };

  const built = draft.build();
  const bankBalanceAfter = input.carried.bankBalance - payment.bankSpent;
  const stockRemaining = input.stock
    ? input.stock.remaining - input.amount
    : undefined;
  return {
    status: "planned",
    mutation: built.mutation,
    persist: {
      carried: built.persist,
      ...(payment.bankSpent === 0
        ? {}
        : {
            bankOps: [
              {
                characterId: input.characterId,
                delta: -payment.bankSpent,
                expectedBalanceAfter: bankBalanceAfter,
                ledger: "shop-purchase" as const,
              },
            ],
          }),
      ...(input.stock === undefined || stockRemaining === undefined
        ? {}
        : {
            stockOps: [
              {
                shopId: input.shopId,
                offerId: input.offerId,
                initialStock: input.stock.initial,
                amount: input.amount,
                expectedRemaining: stockRemaining,
              },
            ],
          }),
      audits: [
        {
          kind: "shop-purchase",
          npcTypeId: input.npcTypeId,
          shopId: input.shopId,
          offerId: input.offerId,
          itemTypeId: input.itemTypeId,
          amount: input.amount,
          totalCost,
          bankSpent: payment.bankSpent,
          ...(input.subtype === undefined
            ? {}
            : { subtype: input.subtype.value }),
          ...(stockRemaining === undefined ? {} : { stockRemaining }),
          ...(input.currencyItemTypeId === undefined
            ? {}
            : { currencyItemTypeId: input.currencyItemTypeId }),
        },
      ],
    },
    bankSpent: payment.bankSpent,
    bankBalanceAfter,
    ...(stockRemaining === undefined ? {} : { stockRemaining }),
  };
}

type PaymentOutcome =
  | { readonly status: "paid"; readonly bankSpent: number }
  | { readonly status: ShopActionFailedReason };

/** Stages the money leg on the draft; nothing is granted yet. */
function payFor(
  draft: CarriedItemDraft,
  input: ShopPurchasePlanInput,
  totalCost: number,
): PaymentOutcome {
  if (input.currencyItemTypeId !== undefined) {
    // A custom-currency shop takes exactly that item and gives no change, so
    // the bank never covers any part of it.
    if (draft.countOf(input.currencyItemTypeId) < totalCost) {
      return { status: "insufficient-funds" };
    }
    if (
      totalCost > 0 &&
      !draft.destroy(
        input.currencyItemTypeId,
        totalCost,
        "shop-purchase-currency",
      )
    ) {
      return { status: "insufficient-funds" };
    }
    return { status: "paid", bankSpent: 0 };
  }
  const carried = countCarriedCoins(draft.items());
  const carriedWorth = countMoneyWorth(carried);
  const carriedPay = Math.min(carriedWorth, totalCost);
  const bankSpent = totalCost - carriedPay;
  if (bankSpent > input.carried.bankBalance) {
    return { status: "insufficient-funds" };
  }
  const spend = planMoneySpend(carried, carriedPay);
  if (!spend) return { status: "insufficient-funds" };
  const spends = [
    { typeId: GOLD_COIN_TYPE_ID, count: spend.goldSpent },
    { typeId: PLATINUM_COIN_TYPE_ID, count: spend.platinumSpent },
    { typeId: CRYSTAL_COIN_TYPE_ID, count: spend.crystalSpent },
  ];
  for (const leg of spends) {
    if (leg.count === 0) continue;
    if (!draft.destroy(leg.typeId, leg.count, "shop-purchase")) {
      return { status: "insufficient-funds" };
    }
  }
  const change = [
    { typeId: GOLD_COIN_TYPE_ID, count: spend.goldChange },
    { typeId: PLATINUM_COIN_TYPE_ID, count: spend.platinumChange },
  ];
  for (const leg of change) {
    if (leg.count === 0) continue;
    if (draft.grantStackable(leg.typeId, leg.count, "shop-purchase-change") > 0) {
      return { status: "no-space" };
    }
  }
  return { status: "paid", bankSpent };
}
