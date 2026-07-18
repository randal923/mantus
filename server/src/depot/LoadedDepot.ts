import type { Item } from "../item/Item";

export interface LoadedDepot {
  readonly characterId: string;
  readonly items: ReadonlyArray<Item>;
  readonly stash: ReadonlyMap<number, number>;
  readonly depotRevisions: ReadonlyMap<number, number>;
  readonly inboxRevision: number;
  readonly stashRevision: number;
}
