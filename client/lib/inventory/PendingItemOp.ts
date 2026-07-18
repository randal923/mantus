import type { ClientMessage, EquipmentSlot, Position } from "@tibia/protocol";

/**
 * A drag intent queued client-side. Ops render optimistically and are sent
 * to the server one at a time; revisions are resolved from the latest
 * server-confirmed inventory at send time, never stored on the op.
 */
export type PendingItemOp =
  | {
      readonly kind: "move";
      readonly itemId: string;
      readonly destinationContainerId: string;
      readonly destinationSlot: number;
    }
  | {
      readonly kind: "equip";
      readonly itemId: string;
      readonly slot: EquipmentSlot;
    }
  | {
      readonly kind: "unequip";
      readonly itemId: string;
      readonly slot: EquipmentSlot;
      readonly destination?: {
        readonly containerId: string;
        readonly slot: number;
      };
    }
  | {
      readonly kind: "drop";
      readonly itemId: string;
      readonly position: Position;
    }
  | {
      readonly kind: "pickup";
      /** Map instance id and revision captured from the tile at drag time. */
      readonly itemId: string;
      readonly revision: number;
      readonly position: Position;
      /** Total stack weight captured from the tile, for capacity pre-checks. */
      readonly weight?: number;
      readonly destination?: {
        readonly containerId: string;
        readonly slot: number;
      };
    }
  | {
      readonly kind: "move-map";
      readonly itemId: string;
      readonly revision: number;
      readonly fromPosition: Position;
      readonly toPosition: Position;
    };

export type PendingItemOpIntent = Extract<
  ClientMessage,
  {
    type:
      | "move-item"
      | "equip-item"
      | "unequip-item"
      | "drop-item"
      | "pickup-item"
      | "move-map-item";
  }
>;
