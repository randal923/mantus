import type { Item } from "./Item";
import type { ItemMutation } from "./ItemMutation";

export type PotionItemPlan =
  | {
      readonly kind: "transform";
      readonly before: Item;
      readonly flaskAfter: Item;
    }
  | {
      readonly kind: "merge";
      readonly before: Item;
      readonly potionAfter: Item;
      readonly flaskBefore: Item;
      readonly flaskAfter: Item;
    }
  | {
      readonly kind: "create";
      readonly before: Item;
      readonly potionAfter: Item;
      readonly flaskAfter: Item;
    };

export interface PlannedPotionUse {
  readonly itemPlan: PotionItemPlan;
  readonly mutation: ItemMutation;
}
