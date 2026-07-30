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
  /** A gold shop spends this for whatever the carried coins cannot cover. */
  bankBalance: number;
  coinWeights: ShopCoinWeights;
  pageCount: number;
  nextPage: number;
  entries: ReadonlyArray<ShopEntryProjection>;
  /** Which offer the shared amount panel is driving; null until one is picked. */
  selectedOfferId: string | null;
  pending: boolean;
  error: ShopActionFailedReason | null;
  lastTransaction: ShopTransactedMessage | null;
  pendingPurchaseCost: number;
}
