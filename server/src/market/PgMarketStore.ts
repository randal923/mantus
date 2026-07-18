import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import { MarketTxHelper } from "./MarketTxHelper";
import { PgMarketAcceptOps } from "./PgMarketAcceptOps";
import { PgMarketCancelOps } from "./PgMarketCancelOps";
import { PgMarketCreateOps } from "./PgMarketCreateOps";
import { PgMarketReadOps } from "./PgMarketReadOps";
import type {
  AcceptBuyOfferRequest,
  AcceptOfferResult,
  AcceptSellOfferRequest,
  CancelOfferRequest,
  CancelOfferResult,
  CreateBuyOfferRequest,
  CreateOfferResult,
  CreateSellOfferRequest,
  ExpiredOfferResult,
  MarketOfferSummary,
  MarketOfferView,
  MarketOpenData,
  MarketOwnHistoryRecord,
  MarketOwnOfferRecord,
  MarketStore,
} from "./MarketStore";

export class PgMarketStore implements MarketStore {
  private readonly readOps: PgMarketReadOps;
  private readonly createOps: PgMarketCreateOps;
  private readonly acceptOps: PgMarketAcceptOps;
  private readonly cancelOps: PgMarketCancelOps;

  constructor(pool: Pool, catalog: ItemCatalog) {
    const helper = new MarketTxHelper();
    this.readOps = new PgMarketReadOps(pool, helper);
    this.createOps = new PgMarketCreateOps(pool, catalog, helper);
    this.acceptOps = new PgMarketAcceptOps(pool, helper);
    this.cancelOps = new PgMarketCancelOps(pool, helper);
  }

  openData(characterId: string): Promise<MarketOpenData> {
    return this.readOps.openData(characterId);
  }

  averagePrices(
    itemTypeIds: ReadonlyArray<number>,
  ): Promise<ReadonlyMap<number, number>> {
    return this.readOps.averagePrices(itemTypeIds);
  }

  offersForType(
    itemTypeId: number,
    limitPerSide: number,
  ): Promise<ReadonlyArray<MarketOfferView>> {
    return this.readOps.offersForType(itemTypeId, limitPerSide);
  }

  offerById(offerId: string): Promise<MarketOfferSummary | null> {
    return this.readOps.offerById(offerId);
  }

  ownOffers(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnOfferRecord>> {
    return this.readOps.ownOffers(characterId, limit);
  }

  ownHistory(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnHistoryRecord>> {
    return this.readOps.ownHistory(characterId, limit);
  }

  createSellOffer(request: CreateSellOfferRequest): Promise<CreateOfferResult> {
    return this.createOps.createSellOffer(request);
  }

  createBuyOffer(request: CreateBuyOfferRequest): Promise<CreateOfferResult> {
    return this.createOps.createBuyOffer(request);
  }

  acceptSellOffer(request: AcceptSellOfferRequest): Promise<AcceptOfferResult> {
    return this.acceptOps.acceptSellOffer(request);
  }

  acceptBuyOffer(request: AcceptBuyOfferRequest): Promise<AcceptOfferResult> {
    return this.acceptOps.acceptBuyOffer(request);
  }

  cancelOffer(request: CancelOfferRequest): Promise<CancelOfferResult> {
    return this.cancelOps.cancelOffer(request);
  }

  resolveExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredOfferResult>> {
    return this.cancelOps.resolveExpired(now, limit);
  }
}
