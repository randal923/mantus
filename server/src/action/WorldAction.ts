import type { ItemType } from "../item/ItemType";
import type { MapItem } from "../MapItem";

/**
 * A use-map intent resolved against the tile's current state. "map-movement"
 * defers to the ladder/dropdown movement path; "unsupported" is the fail-closed
 * bucket for scripted or unregistered interactions.
 */
export type WorldAction =
  | { readonly kind: "map-movement" }
  | {
      readonly kind: "door";
      readonly item: MapItem;
      readonly type: ItemType;
      readonly door: NonNullable<ItemType["door"]>;
    }
  | { readonly kind: "lever"; readonly item: MapItem; readonly toTypeId: number }
  | { readonly kind: "read"; readonly item: MapItem; readonly type: ItemType }
  | { readonly kind: "rotate"; readonly item: MapItem; readonly toTypeId: number }
  | { readonly kind: "unsupported" };
