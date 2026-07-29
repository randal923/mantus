import type {
  StoreActionFailedReason,
  StoreCategory,
  StoreProduct,
} from "@tibia/protocol";

/**
 * The store window's client state, laid out the way the official store is: a
 * category tree, one page of products at a time, and a description fetched
 * for whatever the player has selected.
 *
 * All of it is display state. Prices, availability and the catalog arrive
 * from the server; the client never decides what something costs or whether
 * it may be bought.
 */
export interface StoreSessionState {
  readonly categories: ReadonlyArray<StoreCategory>;
  /** The landing page's featured products. */
  readonly home: ReadonlyArray<StoreProduct>;
  /** null while the landing page is showing. */
  readonly categoryId: string | null;
  readonly products: ReadonlyArray<StoreProduct>;
  readonly page: number;
  readonly pageCount: number;
  readonly selectedProductId: string | null;
  /** Fetched on selection; null until the server answers. */
  readonly description: string | null;
  readonly pending: boolean;
  readonly pendingOfferId: string | null;
  readonly purchasedOfferId: string | null;
  readonly error: StoreActionFailedReason | null;
}
