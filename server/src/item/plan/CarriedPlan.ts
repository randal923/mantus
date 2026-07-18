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
}
