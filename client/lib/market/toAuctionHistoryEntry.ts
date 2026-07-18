import type { MarketHistoryEntry } from "@tibia/protocol";
import type { AuctionHistoryEntry } from "../../components/auction/auctionTypes";

export function toAuctionHistoryEntry(
  entry: MarketHistoryEntry,
): AuctionHistoryEntry {
  return {
    itemId: String(entry.itemTypeId),
    side: entry.side,
    name: entry.name,
    spriteId: entry.spriteId,
    amount: entry.amount,
    pricePerItem: entry.unitPrice,
    state: entry.state,
    occurredAt: entry.occurredAt,
  };
}
