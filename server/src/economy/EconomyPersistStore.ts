import type { EconomyPersistPlan } from "./EconomyPersistPlan";

/** Commits the durable half of a memory-first economy operation. */
export interface EconomyPersistStore {
  persist(plan: EconomyPersistPlan): Promise<void>;
}
