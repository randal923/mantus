import type {
  EquipmentSlot,
  InventoryItem,
  MapItemState,
  Position,
} from "@tibia/protocol";

export type ItemDragSource =
  | {
      readonly kind: "owned";
      readonly item: InventoryItem;
      readonly location:
        | {
            readonly kind: "container";
            readonly containerId: string;
            readonly slot: number;
          }
        | { readonly kind: "equipment"; readonly slot: EquipmentSlot };
    }
  | {
      readonly kind: "world";
      readonly item: MapItemState;
      readonly position: Position;
    };
