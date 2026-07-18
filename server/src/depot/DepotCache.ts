import type { Item } from "../item/Item";

/**
 * Memory-resident storage for one online character: every depot/inbox item
 * subtree plus stash counts and the storage revision counters. Authoritative
 * while the character is online; the DB is written behind it.
 */
export interface DepotCache {
  readonly items: ReadonlyArray<Item>;
  readonly stash: ReadonlyMap<number, number>;
  readonly depotRevisions: ReadonlyMap<number, number>;
  readonly inboxRevision: number;
  readonly stashRevision: number;
}
