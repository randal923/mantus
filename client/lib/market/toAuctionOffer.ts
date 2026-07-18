import type { MarketOfferEntry } from "@tibia/protocol";
import type { AuctionOffer } from "../../components/auction/auctionTypes";

export function toAuctionOffer(
  entry: MarketOfferEntry,
  itemTypeId: number,
): AuctionOffer {
  return {
    id: entry.offerId,
    itemId: String(itemTypeId),
    side: entry.side,
    amount: entry.amount,
    pricePerItem: entry.unitPrice,
    expiresAt: entry.expiresAt,
    mine: entry.mine,
  };
}
