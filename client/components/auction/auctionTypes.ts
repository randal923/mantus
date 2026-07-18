export type AuctionItemCategory =
  | "weapons"
  | "armor"
  | "shields"
  | "spellbooks"
  | "consumables"
  | "runes"
  | "valuables";

export type AuctionOfferSide = "buy" | "sell";

export interface AuctionHouseItem {
  id: string;
  name: string;
  category: AuctionItemCategory;
  spriteId: number;
  ownedCount: number;
  averagePrice: number;
}

export interface AuctionOffer {
  id: string;
  itemId: string;
  side: AuctionOfferSide;
  amount: number;
  pricePerItem: number;
  expiresAt: string;
  /** True when the viewing character created this offer. */
  mine?: boolean;
}

export interface AuctionOwnOffer {
  id: string;
  itemId: string;
  side: AuctionOfferSide;
  name: string;
  spriteId: number;
  amount: number;
  pricePerItem: number;
  expiresAt: string;
}

export type AuctionHistoryState = "accepted" | "cancelled" | "expired";

export interface AuctionHistoryEntry {
  itemId: string;
  side: AuctionOfferSide;
  name: string;
  spriteId: number;
  amount: number;
  pricePerItem: number;
  state: AuctionHistoryState;
  occurredAt: string;
}

export interface AuctionOfferAcceptanceIntent {
  offerId: string;
  amount: number;
}

export interface AuctionOrderIntent {
  itemId: string;
  side: AuctionOfferSide;
  amount: number;
  pricePerItem: number;
}
