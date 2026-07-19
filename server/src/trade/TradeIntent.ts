import type {
  TradeAcceptMessage,
  TradeCancelMessage,
  TradeRequestMessage,
} from "@tibia/protocol";

export type TradeIntent =
  | TradeRequestMessage
  | TradeAcceptMessage
  | TradeCancelMessage;
