import type { MarketItemEntry } from "@tibia/protocol";
import type { AuctionHouseItem } from "../../components/auction/auctionTypes";

export function toAuctionHouseItem(entry: MarketItemEntry): AuctionHouseItem {
  return {
    id: String(entry.itemTypeId),
    name: entry.name,
    category: entry.category,
    spriteId: entry.spriteId,
    ownedCount: entry.ownedCount,
    averagePrice: entry.averagePrice,
  };
}
