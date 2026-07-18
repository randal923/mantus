import type { InventoryItemPresentation } from "@tibia/protocol";

export type InventoryPrediction =
  | {
      readonly kind: "remove";
      readonly itemId: string;
      readonly count: number;
    }
  | {
      readonly kind: "add";
      readonly item: InventoryItemPresentation;
      readonly count: number;
      readonly itemIds: ReadonlyArray<string>;
    };
