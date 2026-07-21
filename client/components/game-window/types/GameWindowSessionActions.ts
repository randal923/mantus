import type { BestiarySession } from "../../../hooks/useBestiarySession";
import type { BosstiarySession } from "../../../hooks/useBosstiarySession";
import type { DepotSession } from "../../../hooks/useDepotSession";
import type { GemSession } from "../../../hooks/useGemSession";
import type { GuildSession } from "../../../hooks/useGuildSession";
import type { HighscoresSession } from "../../../hooks/useHighscoresSession";
import type { HouseSession } from "../../../hooks/useHouseSession";
import type { MarketSession } from "../../../hooks/useMarketSession";
import type { OptimisticInventory } from "../../../hooks/useOptimisticInventory";
import type { PartySession } from "../../../hooks/usePartySession";
import type { TradeSession } from "../../../hooks/useTradeSession";
import type { VipSession } from "../../../hooks/useVipSession";
import type { WheelSession } from "../../../hooks/useWheelSession";
import type { PendingItemOp } from "../../../lib/inventory/PendingItemOp";

export interface GameWindowSessionActions {
  inventory: Omit<OptimisticInventory, "inventory">;
  depot: Omit<DepotSession, "session">;
  market: Omit<MarketSession, "session">;
  trade: Omit<TradeSession, "session">;
  party: Omit<PartySession, "state">;
  guild: Omit<GuildSession, "state">;
  house: Omit<HouseSession, "state">;
  vip: Omit<VipSession, "state">;
  highscores: Omit<HighscoresSession, "state">;
  bestiary: Omit<BestiarySession, "state">;
  bosstiary: Omit<BosstiarySession, "state">;
  wheel: Omit<WheelSession, "state">;
  gems: Omit<GemSession, "state">;
  dispatchItemOpChecked: (op: PendingItemOp) => boolean;
}
