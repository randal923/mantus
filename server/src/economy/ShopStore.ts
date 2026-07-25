import type {
  ShopPurchaseResult,
  ShopSaleResult,
} from "./ShopOperationResult";

export type ShopItemSubtype =
  | { readonly kind: "charges"; readonly value: number }
  | { readonly kind: "fluid"; readonly value: number };

/**
 * Server-owned facts about one shop transaction, resolved from the catalog
 * at execution time. Nothing here ever comes from the client.
 */
export interface ShopPurchaseRequest {
  readonly npcTypeId: string;
  readonly shopId: string;
  readonly offerId: string;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly totalCost: number;
  readonly stackable: boolean;
  readonly maxCount: number;
  readonly currencyItemTypeId?: number;
  readonly currencyMaxCount?: number;
  readonly subtype?: ShopItemSubtype;
  readonly stock?: number;
}

export interface ShopSaleRequest {
  readonly npcTypeId: string;
  readonly shopId: string;
  readonly offerId: string;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly totalProceeds: number;
  readonly currencyItemTypeId?: number;
  readonly currencyMaxCount?: number;
  readonly subtype?: ShopItemSubtype;
}

/** One finite-stock offer's durable refill schedule, owned by the catalog. */
export interface ShopRestockSchedule {
  readonly shopId: string;
  readonly offerId: string;
  readonly stock: number;
  readonly restockIntervalSeconds?: number;
}

export interface ShopStore {
  purchase(
    characterId: string,
    request: ShopPurchaseRequest,
  ): Promise<ShopPurchaseResult>;
  sell(characterId: string, request: ShopSaleRequest): Promise<ShopSaleResult>;
  /** Reconciles the durable stock rows with the catalog at startup. */
  seedRestockSchedules?(
    schedules: ReadonlyArray<ShopRestockSchedule>,
  ): Promise<void>;
  /** Refills every offer past its deadline; returns how many rows changed. */
  restockDueOffers?(): Promise<number>;
}
