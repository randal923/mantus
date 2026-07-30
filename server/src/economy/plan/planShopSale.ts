import {
  BANK_LIMITS,
  CRYSTAL_WORTH,
  PLATINUM_WORTH,
  type ShopActionFailedReason,
} from "@tibia/protocol";
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
import type { ShopItemSubtype } from "../ShopStore";
import { shopSubtypeAttributes } from "../shopSubtypeAttributes";
import { CarriedItemDraft } from "./CarriedItemDraft";

export interface ShopSalePlanInput {
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
  /** Absent ⇒ the shop pays in ordinary money (gold/platinum/crystal). */
  readonly currencyItemTypeId?: number;
}

export type ShopSalePlan =
  | {
      readonly status: "planned";
      readonly mutation: ItemMutation;
      readonly persist: EconomyPersistPlan;
      /** Proceeds that did not fit and went to the bank instead. */
      readonly bankCredited: number;
      readonly bankBalanceAfter: number;
    }
  | { readonly status: ShopActionFailedReason };

/**
 * Plans one sale in memory: the goods leave and the proceeds arrive as coins,
 * with anything that will not fit credited to the bank rather than failing the
 * sale — the behaviour Canary has and the DB-first path already implemented.
 */
export function planShopSale(input: ShopSalePlanInput): ShopSalePlan {
  const totalProceeds = input.unitPrice * input.amount;
  if (!Number.isSafeInteger(totalProceeds) || totalProceeds < 0) {
    return { status: "invalid-item" };
  }
  const draft = new CarriedItemDraft(
    input.catalog,
    input.characterId,
    input.carried.items,
    input.carried.capacityMax,
  );
  const attributes = shopSubtypeAttributes(input.subtype);
  const matcher = input.subtype === undefined ? undefined : attributes;
  if (draft.countOf(input.itemTypeId, matcher) < input.amount) {
    return { status: "not-owned" };
  }
  if (!draft.destroy(input.itemTypeId, input.amount, "shop-sale", matcher)) {
    return { status: "not-owned" };
  }

  let bankCredited = 0;
  if (input.currencyItemTypeId !== undefined) {
    // A custom shop currency has no bank denomination, so it stays
    // all-or-nothing: a sale whose payout will not fit is refused outright.
    if (
      totalProceeds > 0 &&
      draft.grantStackable(
        input.currencyItemTypeId,
        totalProceeds,
        "shop-sale-currency",
      ) > 0
    ) {
      return { status: "no-space" };
    }
  } else {
    const proceeds = planMoneyGrant(totalProceeds);
    const grants = [
      { typeId: CRYSTAL_COIN_TYPE_ID, count: proceeds.crystal, worth: CRYSTAL_WORTH },
      { typeId: PLATINUM_COIN_TYPE_ID, count: proceeds.platinum, worth: PLATINUM_WORTH },
      { typeId: GOLD_COIN_TYPE_ID, count: proceeds.gold, worth: 1 },
    ];
    for (const grant of grants) {
      if (grant.count === 0) continue;
      const ungranted = draft.grantStackable(
        grant.typeId,
        grant.count,
        "shop-sale",
      );
      bankCredited += ungranted * grant.worth;
    }
  }
  if (draft.usedWeight() > draft.capacityBudget()) {
    return { status: "no-capacity" };
  }
  const bankBalanceAfter = input.carried.bankBalance + bankCredited;
  if (bankBalanceAfter > BANK_LIMITS.maxBalance) {
    return { status: "no-space" };
  }

  const built = draft.build();
  return {
    status: "planned",
    mutation: built.mutation,
    persist: {
      carried: built.persist,
      ...(bankCredited === 0
        ? {}
        : {
            bankOps: [
              {
                characterId: input.characterId,
                delta: bankCredited,
                expectedBalanceAfter: bankBalanceAfter,
                ledger: "shop-sale" as const,
              },
            ],
          }),
      audits: [
        {
          kind: "shop-sale",
          npcTypeId: input.npcTypeId,
          shopId: input.shopId,
          offerId: input.offerId,
          itemTypeId: input.itemTypeId,
          amount: input.amount,
          totalProceeds,
          bankCredited,
          ...(input.subtype === undefined
            ? {}
            : { subtype: input.subtype.value }),
          ...(input.currencyItemTypeId === undefined
            ? {}
            : { currencyItemTypeId: input.currencyItemTypeId }),
        },
      ],
    },
    bankCredited,
    bankBalanceAfter,
  };
}
