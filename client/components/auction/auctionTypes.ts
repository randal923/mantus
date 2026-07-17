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
