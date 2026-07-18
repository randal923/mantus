import type { Item } from "../item/Item";
import type { DepotPersistStashOp, DepotRevisionBump } from "./DepotPersistPlan";

export interface DepotCacheEvent {
  readonly upserts?: ReadonlyArray<Item>;
  readonly removedItemIds?: ReadonlyArray<string>;
  readonly stashSets?: ReadonlyArray<DepotPersistStashOp>;
  readonly bumps?: ReadonlyArray<DepotRevisionBump>;
}
