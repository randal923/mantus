import type { Item } from "./Item";

export interface LoadedInventory {
  readonly characterId: string;
  readonly capacityMax: number;
  readonly items: ReadonlyArray<Item>;
}
