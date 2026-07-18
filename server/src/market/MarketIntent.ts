import type {
  MarketAcceptOfferMessage,
  MarketBrowseMessage,
  MarketCancelOfferMessage,
  MarketCreateOfferMessage,
  MarketOpenMessage,
  MarketOwnHistoryMessage,
  MarketOwnOffersMessage,
} from "@tibia/protocol";

export type MarketIntent =
  | MarketOpenMessage
  | MarketBrowseMessage
  | MarketCreateOfferMessage
  | MarketAcceptOfferMessage
  | MarketCancelOfferMessage
  | MarketOwnOffersMessage
  | MarketOwnHistoryMessage;
