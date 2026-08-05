import type { Pool } from "pg";
import { parseBalance } from "../economy/parseBalance";
import type { MarketOfferRow } from "./MarketOfferRow";
import type { MarketTxHelper } from "./MarketTxHelper";
import type {
  MarketOfferSummary,
  MarketOfferView,
  MarketOpenData,
  MarketOwnHistoryRecord,
  MarketOwnOfferRecord,
} from "./MarketStore";
import { averagePricesQuery } from "./sql/averagePricesQuery";
import { buyOffersForTypeQuery } from "./sql/buyOffersForTypeQuery";
import { escrowAttributesForOffersQuery } from "./sql/escrowAttributesForOffersQuery";
import { offerByIdQuery } from "./sql/offerByIdQuery";
import { marketOpenDataQuery } from "./sql/marketOpenDataQuery";
import { ownHistoryQuery } from "./sql/ownHistoryQuery";
import { ownOffersQuery } from "./sql/ownOffersQuery";
import { sellOffersForTypeQuery } from "./sql/sellOffersForTypeQuery";

const MAX_OFFER_TYPE_IDS = 6_400;

type OfferViewRow = Pick<
  MarketOfferRow,
  "id" | "character_id" | "side" | "remaining_amount" | "unit_price" | "expires_at"
>;

export class PgMarketReadOps {
  constructor(
    private readonly pool: Pool,
    private readonly helper: MarketTxHelper,
  ) {}

  async openData(characterId: string): Promise<MarketOpenData> {
    const result = await this.pool.query<{
      balance: string;
      active_count: number;
      offer_type_ids: number[];
    }>(marketOpenDataQuery, [characterId, MAX_OFFER_TYPE_IDS]);
    const row = result.rows[0];
    if (!row) throw new Error("market open data returned no row");
    return {
      balance: parseBalance(row.balance),
      activeOfferCount: row.active_count,
      offerTypeIds: row.offer_type_ids,
    };
  }

  async averagePrices(
    itemTypeIds: ReadonlyArray<number>,
  ): Promise<ReadonlyMap<number, number>> {
    if (itemTypeIds.length === 0) return new Map();
    const result = await this.pool.query<{
      item_type_id: number;
      average_price: string;
    }>(averagePricesQuery, [itemTypeIds]);
    return new Map(
      result.rows.map((row) => [
        row.item_type_id,
        parseBalance(row.average_price),
      ]),
    );
  }

  async offersForType(
    itemTypeId: number,
    limitPerSide: number,
  ): Promise<ReadonlyArray<MarketOfferView>> {
    const [sell, buy] = await Promise.all([
      this.pool.query<OfferViewRow>(sellOffersForTypeQuery, [
        itemTypeId,
        limitPerSide,
      ]),
      this.pool.query<OfferViewRow>(buyOffersForTypeQuery, [
        itemTypeId,
        limitPerSide,
      ]),
    ]);
    const attributesByOffer = await this.escrowAttributesFor(
      sell.rows.map((row) => row.id),
    );
    return [...sell.rows, ...buy.rows].map((row) => {
      const attributes = attributesByOffer.get(row.id);
      return {
        id: row.id,
        characterId: row.character_id,
        side: row.side,
        remainingAmount: row.remaining_amount,
        unitPrice: parseBalance(row.unit_price),
        expiresAt: row.expires_at,
        ...(attributes ? { attributes } : {}),
      };
    });
  }

  /**
   * Attribute bags for unique rarity sell offers. An offer with several
   * escrow rows (bulk pristine stock) never appears here — only amount-1
   * attributed listings escrow an attributed row.
   */
  private async escrowAttributesFor(
    offerIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, Readonly<Record<string, unknown>>>> {
    if (offerIds.length === 0) return new Map();
    const result = await this.pool.query<{
      offer_id: string;
      attributes: unknown;
    }>(escrowAttributesForOffersQuery, [offerIds]);
    const byOffer = new Map<string, Readonly<Record<string, unknown>>>();
    for (const row of result.rows) {
      if (
        typeof row.attributes === "object" &&
        row.attributes !== null &&
        !Array.isArray(row.attributes)
      ) {
        byOffer.set(
          row.offer_id,
          row.attributes as Readonly<Record<string, unknown>>,
        );
      }
    }
    return byOffer;
  }

  async offerById(offerId: string): Promise<MarketOfferSummary | null> {
    const result = await this.pool.query<MarketOfferRow>(offerByIdQuery, [
      offerId,
    ]);
    const row = result.rows[0];
    if (!row) return null;
    const offer = this.helper.offerFromRow(row);
    return {
      id: offer.id,
      characterId: offer.characterId,
      accountId: offer.accountId,
      side: offer.side,
      itemTypeId: offer.itemTypeId,
      amount: offer.amount,
      remainingAmount: offer.remainingAmount,
      unitPrice: offer.unitPrice,
      expiresAt: offer.expiresAt,
    };
  }

  async ownOffers(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnOfferRecord>> {
    const result = await this.pool.query<
      Pick<
        MarketOfferRow,
        "id" | "side" | "item_type_id" | "remaining_amount" | "unit_price" | "expires_at"
      >
    >(ownOffersQuery, [characterId, limit]);
    const attributesByOffer = await this.escrowAttributesFor(
      result.rows.flatMap((row) => (row.side === "sell" ? [row.id] : [])),
    );
    return result.rows.map((row) => {
      const attributes = attributesByOffer.get(row.id);
      return {
        id: row.id,
        side: row.side,
        itemTypeId: row.item_type_id,
        remainingAmount: row.remaining_amount,
        unitPrice: parseBalance(row.unit_price),
        expiresAt: row.expires_at,
        ...(attributes ? { attributes } : {}),
      };
    });
  }

  async ownHistory(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<MarketOwnHistoryRecord>> {
    const result = await this.pool.query<{
      side: "buy" | "sell";
      item_type_id: number;
      amount: number;
      unit_price: string;
      state: "accepted" | "cancelled" | "expired";
      occurred_at: Date;
    }>(ownHistoryQuery, [characterId, limit]);
    return result.rows.map((row) => ({
      side: row.side,
      itemTypeId: row.item_type_id,
      amount: row.amount,
      unitPrice: parseBalance(row.unit_price),
      state: row.state,
      occurredAt: row.occurred_at,
    }));
  }
}
