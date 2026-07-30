export type ShopItemSubtype =
  | { readonly kind: "charges"; readonly value: number }
  | { readonly kind: "fluid"; readonly value: number };

/** One finite-stock offer's durable refill schedule, owned by the catalog. */
export interface ShopRestockSchedule {
  readonly shopId: string;
  readonly offerId: string;
  readonly stock: number;
  readonly restockIntervalSeconds?: number;
}

/** Identifies one finite-stock offer. */
export interface ShopOfferKey {
  readonly shopId: string;
  readonly offerId: string;
}

/** One finite-stock offer's durable counters. */
export interface ShopStockRow extends ShopOfferKey {
  readonly initialStock: number;
  readonly remainingStock: number;
}

/**
 * Durable shop state. Trades themselves are planned in memory and committed
 * through `EconomyPersistStore`, so only finite stock lives here.
 */
export interface ShopStore {
  /** Reconciles the durable stock rows with the catalog at startup. */
  seedRestockSchedules?(
    schedules: ReadonlyArray<ShopRestockSchedule>,
  ): Promise<void>;
  /** Every offer's committed counters, read once to seed the in-memory mirror. */
  readStock?(): Promise<ReadonlyArray<ShopStockRow>>;
  /** Refills every offer past its deadline; returns the offers that changed. */
  restockDueOffers?(): Promise<ReadonlyArray<ShopOfferKey>>;
}
