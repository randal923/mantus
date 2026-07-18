import type { DepotItemEntry, InventoryItem, StashEntry } from "@tibia/protocol";

/**
 * A queued depot intent. The server answers within a tick, so there is no
 * client-side prediction — actions serialize one at a time and each is built
 * against the latest authoritative depot state when it is sent.
 */
export type DepotAction =
  | { readonly kind: "deposit"; readonly item: InventoryItem }
  | { readonly kind: "withdraw"; readonly entry: DepotItemEntry }
  | {
      readonly kind: "stash-deposit";
      readonly item: InventoryItem;
      readonly count: number;
    }
  | {
      readonly kind: "stash-withdraw";
      readonly entry: StashEntry;
      readonly count: number;
    };
