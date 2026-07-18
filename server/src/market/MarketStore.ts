import type { MarketSide } from "@tibia/protocol";
import type { Item } from "../item/Item";

export interface MarketOfferSummary {
  readonly id: string;
  readonly characterId: string;
  readonly accountId: string;
  readonly side: MarketSide;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly remainingAmount: number;
  readonly unitPrice: number;
  readonly expiresAt: Date;
}

/** Public per-item view; the service turns characterId into a `mine` flag. */
export interface MarketOfferView {
  readonly id: string;
  readonly characterId: string;
  readonly side: MarketSide;
  readonly remainingAmount: number;
  readonly unitPrice: number;
  readonly expiresAt: Date;
}

export interface MarketOpenData {
  readonly balance: number;
  readonly activeOfferCount: number;
  readonly offerTypeIds: ReadonlyArray<number>;
}

export interface MarketOwnOfferRecord {
  readonly id: string;
  readonly side: MarketSide;
  readonly itemTypeId: number;
  readonly remainingAmount: number;
  readonly unitPrice: number;
  readonly expiresAt: Date;
}

export interface MarketOwnHistoryRecord {
  readonly side: MarketSide;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly state: "accepted" | "cancelled" | "expired";
  readonly occurredAt: Date;
}

/** One depot-cache row the seller escrows from, re-verified inside the tx. */
export interface EscrowSource {
  readonly itemId: string;
  readonly itemRevision: number;
  readonly take: number;
}

export interface CreateSellOfferRequest {
  readonly requestId: string;
  readonly characterId: string;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly fee: number;
  readonly sources: ReadonlyArray<EscrowSource>;
}

export interface CreateBuyOfferRequest {
  readonly requestId: string;
  readonly characterId: string;
  readonly itemTypeId: number;
  readonly amount: number;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly fee: number;
}

export type MarketFailureStatus =
  | "duplicate-request"
  | "offer-not-found"
  | "own-offer"
  | "not-owned"
  | "invalid-item"
  | "insufficient-funds"
  | "insufficient-items"
  | "offer-limit"
  | "escrow-full"
  | "inbox-full"
  | "amount-too-large"
  | "balance-limit";

export type CreateOfferResult =
  | {
      readonly status: "committed";
      readonly offerId: string;
      readonly expiresAt: Date;
      readonly balance: number;
      /** Depot rows reduced by a split, as stored after the commit. */
      readonly depotUpserts: ReadonlyArray<Item>;
      /** Depot rows moved wholly into escrow. */
      readonly removedItemIds: ReadonlyArray<string>;
      /** Depots the escrowed rows came from (their revisions were bumped). */
      readonly sourceDepotIds: ReadonlyArray<number>;
    }
  | { readonly status: MarketFailureStatus };

export interface AcceptSellOfferRequest {
  readonly requestId: string;
  readonly offerId: string;
  readonly buyerCharacterId: string;
  readonly amount: number;
}

export interface AcceptBuyOfferRequest {
  readonly requestId: string;
  readonly offerId: string;
  readonly sellerCharacterId: string;
  readonly amount: number;
  readonly sources: ReadonlyArray<EscrowSource>;
}

export type AcceptOfferResult =
  | {
      readonly status: "committed";
      readonly offerId: string;
      readonly itemTypeId: number;
      readonly amount: number;
      readonly unitPrice: number;
      readonly totalPrice: number;
      /** The accepting character's bank balance after the commit. */
      readonly balance: number;
      readonly counterpartyCharacterId: string;
      /** Inbox rows delivered to the buying side, as stored. */
      readonly deliveredItems: ReadonlyArray<Item>;
      readonly deliveredCharacterId: string;
      /** Seller-side depot rows changed by an accept-buy fill. */
      readonly depotUpserts: ReadonlyArray<Item>;
      readonly removedItemIds: ReadonlyArray<string>;
      /** Depots the sold rows came from (their revisions were bumped). */
      readonly sourceDepotIds: ReadonlyArray<number>;
    }
  | { readonly status: MarketFailureStatus };

export interface CancelOfferRequest {
  readonly requestId: string;
  readonly offerId: string;
  readonly characterId: string;
}

export type CancelOfferResult =
  | {
      readonly status: "committed";
      readonly offerId: string;
      readonly side: MarketSide;
      readonly itemTypeId: number;
      readonly remainingAmount: number;
      readonly unitPrice: number;
      readonly refund: number;
      readonly balance: number;
      /** Escrow rows returned to the owner's inbox, as stored. */
      readonly returnedItems: ReadonlyArray<Item>;
    }
  | { readonly status: MarketFailureStatus };

export interface ExpiredOfferResult {
  readonly offerId: string;
  readonly characterId: string;
  readonly side: MarketSide;
  readonly itemTypeId: number;
  readonly remainingAmount: number;
  readonly refund: number;
  readonly returnedItems: ReadonlyArray<Item>;
}

export interface MarketStore {
  openData(characterId: string): Promise<MarketOpenData>;
  averagePrices(
    itemTypeIds: ReadonlyArray<number>,
  ): Promise<ReadonlyMap<number, number>>;
  offersForType(
    itemTypeId: number,
    limitPerSide: number,
  ): Promise<ReadonlyArray<MarketOfferView>>;
  offerById(offerId: string): Promise<MarketOfferSummary | null>;
  ownOffers(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnOfferRecord>>;
  ownHistory(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnHistoryRecord>>;
  createSellOffer(request: CreateSellOfferRequest): Promise<CreateOfferResult>;
  createBuyOffer(request: CreateBuyOfferRequest): Promise<CreateOfferResult>;
  acceptSellOffer(request: AcceptSellOfferRequest): Promise<AcceptOfferResult>;
  acceptBuyOffer(request: AcceptBuyOfferRequest): Promise<AcceptOfferResult>;
  cancelOffer(request: CancelOfferRequest): Promise<CancelOfferResult>;
  resolveExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredOfferResult>>;
}
