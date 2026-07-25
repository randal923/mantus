import type { Item } from "./Item";

export interface LoadedInventory {
  readonly characterId: string;
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
  /**
   * How long each row has been unchanged, measured on the database clock.
   * Carried decay resumes from it so a logout cannot refresh a burning item.
   */
  readonly agesMs?: ReadonlyMap<string, number>;
}
