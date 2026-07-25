import type { ItemMutation } from "../item/ItemMutation";

export type ShopPurchaseResult =
  | {
      status: "committed";
      mutation: ItemMutation;
      /** Portion of the price debited from the bank balance. */
      bankSpent: number;
    }
  | { status: "insufficient-funds" }
  | { status: "out-of-stock" }
  | { status: "no-space" };

export type ShopSaleResult =
  | {
      status: "committed";
      mutation: ItemMutation;
      /** Proceeds that did not fit in the backpack and went to the bank. */
      bankCredited: number;
    }
  | { status: "not-owned" }
  | { status: "no-space" };
