import type { Item } from "./Item";

export interface WorldItemDeltas {
  readonly hiddenSeedKeys: ReadonlyArray<string>;
  readonly items: ReadonlyArray<Item>;
  /**
   * Milliseconds each persisted item has spent unchanged, measured against the
   * database clock at load time. Decay deadlines resume from it at boot so a
   * restart neither extends nor restarts an item's remaining life.
   */
  readonly agesMs: ReadonlyMap<string, number>;
}
