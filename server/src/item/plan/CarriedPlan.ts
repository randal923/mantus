import type { Position } from "@tibia/protocol";
import type { CarriedPersistPlan } from "../CarriedPersistPlan";
import type { ItemMutation } from "../ItemMutation";

/**
 * A validated carried-item mutation: the memory diff to apply this tick and
 * the DB write to flush behind it. Null from a planner means the intent is
 * rejected with "item-action-failed", mirroring the retired DB ops' throws.
 */
export interface CarriedPlan {
  readonly mutation: ItemMutation;
  readonly persist: CarriedPersistPlan;
  /** Magic effect to broadcast at execution time (e.g. a trash-destroy poff). */
  readonly effect?: { readonly position: Position; readonly effectId: number };
}
