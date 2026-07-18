import type {
  DepotItemEntry,
  InventoryItem,
  StashEntry,
} from "@tibia/protocol";

export type DepotPrediction =
  | { readonly kind: "deposit"; readonly item: InventoryItem }
  | { readonly kind: "withdraw"; readonly item: DepotItemEntry }
  | {
      readonly kind: "stash-deposit";
      readonly item: InventoryItem;
      readonly count: number;
    }
  | {
      readonly kind: "stash-withdraw";
      readonly item: StashEntry;
      readonly count: number;
    };
