import type { SetStateAction } from "react";
import type {
  AccountTier,
  ActionBar,
  AutoPotionSettings,
  CharacterCreationOptions,
  CreatureState,
  FightState,
  OwnCharacterState,
  PotionActionBar,
  ServerErrorCode,
  SpellCatalogEntry,
  TradeClosedReason,
  UiSettings,
} from "@tibia/protocol";
import type { ChatAction } from "../../../lib/chat/chatReducer";
import type { BankSessionState } from "./BankSessionState";
import type { GameWindowSessionActions } from "./GameWindowSessionActions";
import type { GameWindowSessions } from "./GameWindowSessions";
import type { GameWindowState } from "./GameWindowState";
import type { GuildToast } from "./GuildToast";
import type { HouseToast } from "./HouseToast";
import type { ItemTextState } from "./ItemTextState";
import type { LevelUpNotice } from "./LevelUpNotice";
import type { LootSessionState } from "./LootSessionState";
import type { MailboxSessionState } from "./MailboxSessionState";
import type { MapContextMenuState } from "./MapContextMenuState";
import type { NpcDialogueState } from "./NpcDialogueState";
import type { ReportSessionState } from "./ReportSessionState";
import type { ShopSessionState } from "./ShopSessionState";
import type { WorldLoadProgress } from "./WorldLoadProgress";

export interface GameWindowStoreActions {
  setConfig: (config: Pick<GameWindowState, "accessToken" | "onLogout">) => void;
  bindSessions: (
    sessions: GameWindowSessions,
    actions: GameWindowSessionActions,
  ) => void;
  setStatus: (value: SetStateAction<GameWindowState["status"]>) => void;
  setConnectionAttempt: (value: SetStateAction<number>) => void;
  setCharacters: (value: SetStateAction<GameWindowState["characters"]>) => void;
  setAccountTier: (value: SetStateAction<AccountTier>) => void;
  setPremiumDaysRemaining: (value: SetStateAction<number>) => void;
  setCreationOptions: (
    value: SetStateAction<CharacterCreationOptions | null>,
  ) => void;
  setOwnCharacter: (value: SetStateAction<OwnCharacterState | null>) => void;
  setWorldLoading: (value: SetStateAction<boolean>) => void;
  setWorldLoadProgress: (
    value: SetStateAction<WorldLoadProgress | null>,
  ) => void;
  setVisibleCreatures: (
    value: SetStateAction<ReadonlyArray<CreatureState>>,
  ) => void;
  setFightState: (value: SetStateAction<FightState | null>) => void;
  setSpells: (value: SetStateAction<ReadonlyArray<SpellCatalogEntry>>) => void;
  setCombatLog: (value: SetStateAction<ReadonlyArray<string>>) => void;
  setLevelUpNotice: (value: SetStateAction<LevelUpNotice | null>) => void;
  dispatchChat: (action: ChatAction) => void;
  setCharacterBusy: (value: SetStateAction<boolean>) => void;
  setInventoryOpen: (value: SetStateAction<boolean>) => void;
  setCharacterStatsOpen: (value: SetStateAction<boolean>) => void;
  setBattleListVisible: (value: SetStateAction<boolean>) => void;
  setMinimapVisible: (value: SetStateAction<boolean>) => void;
  setMapName: (value: SetStateAction<string | null>) => void;
  setUiSettings: (value: SetStateAction<UiSettings>) => void;
  setActionBar: (value: SetStateAction<ActionBar>) => void;
  setPotionActionBar: (value: SetStateAction<PotionActionBar>) => void;
  setAutoPotionSettings: (
    value: SetStateAction<AutoPotionSettings>,
  ) => void;
  setActionBarConfigSlot: (value: SetStateAction<number | null>) => void;
  setPotionActionBarConfigSlot: (value: SetStateAction<number | null>) => void;
  setMarketSelectedItem: (value: SetStateAction<string | null>) => void;
  setMarketToast: (value: SetStateAction<GameWindowState["marketToast"]>) => void;
  setPartyPanelVisible: (value: SetStateAction<boolean>) => void;
  setGuildModalOpen: (value: SetStateAction<boolean>) => void;
  setGuildToast: (value: SetStateAction<GuildToast | null>) => void;
  setHouseModalOpen: (value: SetStateAction<boolean>) => void;
  setVipPanelVisible: (value: SetStateAction<boolean>) => void;
  setVipToast: (value: SetStateAction<string | null>) => void;
  setHighscoresOpen: (value: SetStateAction<boolean>) => void;
  setWikiOpen: (value: SetStateAction<boolean>) => void;
  setWheelOpen: (value: SetStateAction<boolean>) => void;
  setReportSession: (value: SetStateAction<ReportSessionState | null>) => void;
  setHouseToast: (value: SetStateAction<HouseToast | null>) => void;
  setTradeToast: (value: SetStateAction<TradeClosedReason | null>) => void;
  setItemText: (value: SetStateAction<ItemTextState | null>) => void;
  setNpcDialogue: (value: SetStateAction<NpcDialogueState | null>) => void;
  setBankSession: (value: SetStateAction<BankSessionState | null>) => void;
  setShopSession: (value: SetStateAction<ShopSessionState | null>) => void;
  setMailboxSession: (value: SetStateAction<MailboxSessionState | null>) => void;
  setLootSession: (value: SetStateAction<LootSessionState | null>) => void;
  setGameMenuOpen: (value: SetStateAction<boolean>) => void;
  setLanguageSaving: (value: SetStateAction<boolean>) => void;
  setLanguageError: (value: SetStateAction<boolean>) => void;
  setServerError: (value: SetStateAction<ServerErrorCode | null>) => void;
  setRuneTargeting: (value: SetStateAction<boolean>) => void;
  setPotionTargeting: (value: SetStateAction<boolean>) => void;
  setUseWithTargeting: (value: SetStateAction<boolean>) => void;
  setMapContextMenu: (
    value: SetStateAction<MapContextMenuState | null>,
  ) => void;
  showScreenMessage: (text: string, tone: "look" | "status") => void;
  clearScreenMessage: () => void;
  closeMarket: () => void;
  reconnect: (characterId: string | null) => void;
}
