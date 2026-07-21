import type { BestiarySessionState } from "../../../hooks/useBestiarySession";
import type { BosstiarySessionState } from "../../../hooks/useBosstiarySession";
import type { DepotSessionState } from "../../../hooks/useDepotSession";
import type { GemSessionState } from "../../../hooks/useGemSession";
import type { GuildSessionState } from "../../../hooks/useGuildSession";
import type { HighscoresSessionState } from "../../../hooks/useHighscoresSession";
import type { HouseSessionState } from "../../../hooks/useHouseSession";
import type { MarketSessionState } from "../../../hooks/useMarketSession";
import type { OptimisticInventory } from "../../../hooks/useOptimisticInventory";
import type { PartySessionState } from "../../../hooks/usePartySession";
import type { TradeSessionState } from "../../../hooks/useTradeSession";
import type { VipSessionState } from "../../../hooks/useVipSession";
import type { WheelSessionState } from "../../../hooks/useWheelSession";

export interface GameWindowSessions {
  inventory: OptimisticInventory["inventory"];
  depot: DepotSessionState | null;
  market: MarketSessionState | null;
  trade: TradeSessionState | null;
  party: PartySessionState;
  guild: GuildSessionState;
  house: HouseSessionState;
  vip: VipSessionState;
  highscores: HighscoresSessionState;
  bestiary: BestiarySessionState;
  bosstiary: BosstiarySessionState;
  wheel: WheelSessionState;
  gems: GemSessionState;
}
