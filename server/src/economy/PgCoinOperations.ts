import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { BackpackSlots } from "./BackpackSlots";
import { BackpackSlotLocker } from "./BackpackSlotLocker";
import { countOwnedRows } from "./countOwnedRows";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
} from "./CurrencyBalance";
import { itemFromOwnedRow } from "./itemFromOwnedRow";
import { OwnedItemDestroyer } from "./OwnedItemDestroyer";
import { OwnedItemGranter } from "./OwnedItemGranter";
import type { OwnedItemRow } from "./OwnedItemRow";
import { OwnedItemTally } from "./OwnedItemTally";
import { rowsOfItemType } from "./rowsOfItemType";
import { coinOwnedItemsQuery } from "./sql/coinOwnedItemsQuery";

/**
 * Shared per-transaction item legs for the economy stores: reading owned
 * rows, destroying/creating coin and stackable item rows with optimistic
 * version guards, and auditing each change. Every method must run inside
 * the caller's open transaction.
 */
export class PgCoinOperations {
  private readonly tally = new OwnedItemTally();
  private readonly destroyer: OwnedItemDestroyer;
  private readonly granter: OwnedItemGranter;
  private readonly backpackLocker: BackpackSlotLocker;

  constructor(
    private readonly client: PoolClient,
    private readonly characterId: string,
    catalog: ItemCatalog,
  ) {
    this.destroyer = new OwnedItemDestroyer(client, characterId, this.tally);
    this.granter = new OwnedItemGranter(client, characterId, this.tally);
    this.backpackLocker = new BackpackSlotLocker(client, characterId, catalog);
  }

  async loadOwnedItems(): Promise<OwnedItemRow[]> {
    const owned = await this.client.query<OwnedItemRow>(coinOwnedItemsQuery, [
      this.characterId,
    ]);
    if (owned.rows.length > 500) {
      throw new Error("character has excessive items");
    }
    this.tally.load(owned.rows.length);
    return owned.rows;
  }

  coinRows(rows: ReadonlyArray<OwnedItemRow>): {
    gold: OwnedItemRow[];
    platinum: OwnedItemRow[];
    crystal: OwnedItemRow[];
  } {
    return {
      gold: rowsOfItemType(rows, GOLD_COIN_TYPE_ID),
      platinum: rowsOfItemType(rows, PLATINUM_COIN_TYPE_ID),
      crystal: rowsOfItemType(rows, CRYSTAL_COIN_TYPE_ID),
    };
  }

  rowsOfType(
    rows: ReadonlyArray<OwnedItemRow>,
    itemTypeId: number,
  ): OwnedItemRow[] {
    return rowsOfItemType(rows, itemTypeId);
  }

  countRows(rows: ReadonlyArray<OwnedItemRow>): number {
    return countOwnedRows(rows);
  }

  /** Destroys `count` units across the rows, smallest row ids first. */
  destroyItems(
    rows: ReadonlyArray<OwnedItemRow>,
    count: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: string[],
  ): Promise<void> {
    return this.destroyer.destroyItems(
      rows,
      count,
      itemTypeId,
      reason,
      after,
      removedItemIds,
    );
  }

  /**
   * Grants `count` units of a stackable type: tops up existing stacks, then
   * creates new stacks in free backpack slots. Returns false when the slots
   * run out; the caller must roll the whole transaction back.
   */
  grantStackable(
    rows: ReadonlyArray<OwnedItemRow>,
    count: number,
    itemTypeId: number,
    maxCount: number,
    reason: string,
    after: Map<string, Item>,
    removedItemIds: ReadonlyArray<string>,
    backpack: BackpackSlots,
  ): Promise<boolean> {
    return this.granter.grantStackable(
      rows,
      count,
      itemTypeId,
      maxCount,
      reason,
      after,
      removedItemIds,
      backpack,
    );
  }

  /**
   * Creates `rowCount` single items of a non-stackable type in free backpack
   * slots. Returns false when the slots run out.
   */
  grantSingles(
    rowCount: number,
    itemTypeId: number,
    reason: string,
    after: Map<string, Item>,
    backpack: BackpackSlots,
    attributes: Readonly<Record<string, unknown>> = {},
  ): Promise<boolean> {
    return this.granter.grantSingles(
      rowCount,
      itemTypeId,
      reason,
      after,
      backpack,
      attributes,
    );
  }

  lockBackpackSlots(): Promise<BackpackSlots | null> {
    return this.backpackLocker.lock();
  }

  itemFromRow(row: OwnedItemRow): Item {
    return itemFromOwnedRow(row);
  }
}
