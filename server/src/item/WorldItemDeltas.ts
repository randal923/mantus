import type { Item } from "./Item";

export interface WorldItemDeltas {
  readonly hiddenSeedKeys: ReadonlyArray<string>;
  readonly items: ReadonlyArray<Item>;
}
