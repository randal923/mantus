import type { ItemRarity, ItemTooltipData } from "@tibia/protocol";

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
  clientId: number;
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
  /** Present on unique rarity-item sell offers: the escrowed item's tooltip. */
  tooltip?: ItemTooltipData;
}

/** One of the viewer's own depot rarity items, listable as a unique offer. */
export interface AuctionAttributedItem {
  itemId: string;
  tooltip: ItemTooltipData;
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
  /** Grade of the escrowed rarity item on a unique sell offer. */
  rarity?: ItemRarity;
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
  /** Lists this exact rarity item as a unique amount-1 sell offer. */
  specificItemId?: string;
}
