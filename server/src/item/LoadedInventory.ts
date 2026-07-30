import type { Item } from "./Item";

export interface LoadedInventory {
  readonly characterId: string;
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  /** Committed bank balance, loaded with the items so both attach together. */
  readonly bankBalance: number;
  /**
   * How long each row has been unchanged, measured on the database clock.
   * Carried decay resumes from it so a logout cannot refresh a burning item.
   */
  readonly agesMs?: ReadonlyMap<string, number>;
}
