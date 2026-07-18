import type { DepotActionFailedReason } from "@tibia/protocol";
import type { ItemMutation } from "../item/ItemMutation";
import type { DepotCacheEvent } from "./DepotCacheEvent";
import type { DepotPersistPlan } from "./DepotPersistPlan";

export type DepotMutationFailure = Exclude<
  DepotActionFailedReason,
  "out-of-range" | "busy" | "failed"
>;

/**
 * Result of validating a depot intent against memory: either everything the
 * service needs to apply the mutation this tick (carried-cache mutation, depot
 * cache event, DB persist plan), or the failure to report.
 */
export type DepotMutationPlan =
  | {
      readonly status: "ok";
      readonly inventoryMutation: ItemMutation;
      readonly cacheEvent: DepotCacheEvent;
      readonly persist: DepotPersistPlan;
    }
  | { readonly status: DepotMutationFailure };
