import type { MarketOwnOfferEntry } from "@tibia/protocol";
import type { AuctionOwnOffer } from "../../components/auction/auctionTypes";

export function toAuctionOwnOffer(entry: MarketOwnOfferEntry): AuctionOwnOffer {
  return {
    id: entry.offerId,
    itemId: String(entry.itemTypeId),
    side: entry.side,
    name: entry.name,
    spriteId: entry.spriteId,
    amount: entry.amount,
    pricePerItem: entry.unitPrice,
    expiresAt: entry.expiresAt,
  };
}
