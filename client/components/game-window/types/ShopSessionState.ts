import type {
  ShopActionFailedReason,
  ShopEntryProjection,
  ShopTransactedMessage,
} from "@tibia/protocol";
import type { ShopCoinWeights } from "../../../lib/shop/ShopCoinWeights";

export interface ShopSessionState {
  npcId: string;
  npcName: string;
  shopSessionId: string;
  currencyItemTypeId: number;
  currencySpriteId: number;
  currencyName: string;
  currencyAmount: number;
  currencyWeight: number;
  coinWeights: ShopCoinWeights;
  pageCount: number;
  nextPage: number;
  entries: ReadonlyArray<ShopEntryProjection>;
  pending: boolean;
  error: ShopActionFailedReason | null;
  lastTransaction: ShopTransactedMessage | null;
  pendingPurchaseCost: number;
}
