import type { ChestDefinition } from "./ChestDefinition";
import type { HarvestDefinition } from "./harvestDefinitions";
import type { ItemType } from "../item/ItemType";
import type { MapItem } from "../MapItem";
import type { PodiumDefinition } from "../podium/PodiumDefinition";

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
  | {
      /** A placed quest chest; its reward is granted, not opened as a box. */
      readonly kind: "chest";
      readonly item: MapItem;
      readonly chest: ChestDefinition;
    }
  | {
      /** A clock or sundial: reports the world time, changes nothing. */
      readonly kind: "clock";
      readonly item: MapItem;
    }
  | { readonly kind: "lever"; readonly item: MapItem; readonly toTypeId: number }
  | {
      /** A show-off podium: use opens the owner-scoped edit window. */
      readonly kind: "podium";
      readonly item: MapItem;
      readonly podium: PodiumDefinition;
    }
  | {
      /** A daily reward shrine: use projects the owner's claim state. */
      readonly kind: "daily-shrine";
      readonly item: MapItem;
    }
  | {
      /** An imbuement shrine: use opens the window with no item picked. */
      readonly kind: "imbuement-shrine";
      readonly item: MapItem;
    }
  | {
      /** A harvestable plant: use drops its fruit onto the tile. */
      readonly kind: "harvest";
      readonly item: MapItem;
      readonly harvest: HarvestDefinition;
    }
  | {
      /** Food on the ground: use eats one unit off the tile (Canary parity). */
      readonly kind: "food";
      readonly item: MapItem;
      readonly food: NonNullable<ItemType["food"]>;
    }
  | { readonly kind: "read"; readonly item: MapItem; readonly type: ItemType }
  | { readonly kind: "rotate"; readonly item: MapItem; readonly toTypeId: number }
  | {
      /** A store-bought decoration kit: unwraps into furniture on a house tile. */
      readonly kind: "decoration-kit";
      readonly item: MapItem;
      readonly toTypeId: number;
    }
  | {
      /**
       * A text write onto a writeable map item. Never produced by
       * `resolveWorldAction` (a use-map only ever reads); the write intent
       * upgrades its own resolved "read" so both share one requirement table.
       */
      readonly kind: "write";
      readonly item: MapItem;
      readonly type: ItemType;
      readonly text: string;
      readonly expectedVersion: number;
    }
  | { readonly kind: "unsupported" };
