import type {
  AccountTier,
  ActionBar,
  ChatChannelId,
  ActionBotSettings,
  HuntingBotRoute,
  HuntingBotStopReason,
  LootFilter,
  LootFilterItem,
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  CombatAnalyzerState,
  FightState,
  DailyActionFailedReason,
  DailyRewardHistoryEntry,
  DailyRewardsStateMessage,
  OwnCharacterState,
  Position,
  PodiumActionFailedReason,
  PodiumWindowMessage,
  QuestLineMessage,
  QuestLogFailedReason,
  QuestLogMessage,
  RewardActionFailedReason,
  RewardChestStateMessage,
  ServerErrorCode,
  SpellCatalogEntry,
  TradeClosedReason,
  UiSettings,
} from "@tibia/protocol";
import type { ChatState } from "../../../lib/chat/chatReducer";
import type { AchievementToast } from "./AchievementToast";
import type { BankSessionState } from "./BankSessionState";
import type { GameWindowRuntime } from "./GameWindowRuntime";
import type { GameWindowSessionActions } from "./GameWindowSessionActions";
import type { GameWindowSessions } from "./GameWindowSessions";
import type { GuildToast } from "./GuildToast";
import type { MinimapMarker } from "@tibia/protocol";
import type { HouseToast } from "./HouseToast";
import type { ItemTextState } from "./ItemTextState";
import type { LevelUpNotice } from "./LevelUpNotice";
import type { PortableSellerSaleNotice } from "./PortableSellerSaleNotice";
import type { LootSessionState } from "./LootSessionState";
import type { MailboxSessionState } from "./MailboxSessionState";
import type { MapContextMenuState } from "./MapContextMenuState";
import type { NpcDialogueState } from "./NpcDialogueState";
import type { ReportSessionState } from "./ReportSessionState";
import type { ScreenMessageState } from "./ScreenMessageState";
import type { ShopSessionState } from "./ShopSessionState";
import type { StoreSessionState } from "./StoreSessionState";
import type { WorldLoadProgress } from "./WorldLoadProgress";
import type { ActionBarEditorRequest } from "../../action-bar/ActionBarEditorRequest";
import type { MinimapRoute } from "../../../lib/minimap/MinimapRoute";

export interface GameWindowState {
  accessToken: string;
  onLogout: () => void | Promise<void>;
  runtime: GameWindowRuntime;
  sessions: GameWindowSessions | null;
  sessionActions: GameWindowSessionActions | null;
  status: "connecting" | "connected" | "disconnected";
  connectionAttempt: number;
  characters: ReadonlyArray<CharacterSummary> | null;
  accountTier: AccountTier;
  premiumDaysRemaining: number;
  mantusCoins: number;
  /** Own bank balance as the server last reported it, for the wallet counter. */
  bankBalance: number;
  creationOptions: CharacterCreationOptions | null;
  ownCharacter: OwnCharacterState | null;
  /** Last measured ping round trip in ms, for the HUD counter. */
  latencyMs: number | null;
  worldLoading: boolean;
  worldLoadProgress: WorldLoadProgress | null;
  visibleCreatures: ReadonlyArray<CreatureState>;
  fightState: FightState | null;
  followTargetId: string | null;
  combatAnalyzer: CombatAnalyzerState | null;
  spells: ReadonlyArray<SpellCatalogEntry>;
  combatLog: ReadonlyArray<string>;
  /** Public chat channels this character may open, as the server listed them. */
  chatChannels: ReadonlyArray<{
    id: ChatChannelId;
    label: string;
    open: boolean;
  }>;
  /** Names this character has ignored, echoed by the server. */
  ignoredNames: ReadonlyArray<string>;
  /** The character's own persisted minimap waypoint flags. */
  mapMarkers: ReadonlyArray<MinimapMarker>;
  levelUpNotice: LevelUpNotice | null;
  portableSellerNotice: PortableSellerSaleNotice | null;
  chatState: ChatState;
  chatFocusRequestId: number;
  characterBusy: boolean;
  inventoryOpen: boolean;
  characterStatsOpen: boolean;
  battleListVisible: boolean;
  minimapVisible: boolean;
  mapName: string | null;
  uiSettings: UiSettings;
  actionBar: ActionBar;
  actionBotSettings: ActionBotSettings;
  lootFilter: LootFilter;
  lootFilterOpen: boolean;
  huntingBotOpen: boolean;
  /** The character's saved hunting route; the server owns the walking. */
  huntingBotRoute: HuntingBotRoute;
  /** Live bot state pushed by the server; null before it has ever run. */
  huntingBotStatus: {
    readonly enabled: boolean;
    readonly waypointIndex: number;
    readonly stopReason: HuntingBotStopReason | null;
  } | null;
  /** Last refusal from the hunting-bot window; shown inside it, not as a banner. */
  huntingBotError: ServerErrorCode | null;
  /** What the loot-filter window draws; refreshed when the window opens. */
  lootFilterItems: {
    readonly carried: ReadonlyArray<LootFilterItem>;
    readonly types: ReadonlyArray<LootFilterItem>;
  };
  actionBarEditorRequest: ActionBarEditorRequest | null;
  marketSelectedItem: string | null;
  marketToast: "created" | "accepted" | "cancelled" | null;
  partyPanelVisible: boolean;
  guildModalOpen: boolean;
  guildToast: GuildToast | null;
  houseModalOpen: boolean;
  vipPanelVisible: boolean;
  vipToast: string | null;
  highscoresOpen: boolean;
  wikiOpen: boolean;
  wheelOpen: boolean;
  forgeOpen: boolean;
  proficiencyOpen: boolean;
  /** The shrine window is open; it starts with no item picked. */
  imbuementOpen: boolean;
  /** Carried item the open shrine window is showing, null before one is picked. */
  imbuementItemId: string | null;
  /** The docked kill-tracker panel toggle; renders only with entries. */
  trackerVisible: boolean;
  /** The docked imbuement-tracker panel toggle; timers for equipped gear. */
  imbuementTrackerVisible: boolean;
  preyWindowOpen: boolean;
  huntingTasksOpen: boolean;
  huntFinderOpen: boolean;
  /** Display-only route selected in the Hunt Finder. */
  trackedHuntRoute: MinimapRoute | null;
  outfitWindowOpen: boolean;
  /** Open podium edit window; pushed by the server on podium use. */
  podiumWindow: PodiumWindowMessage | null;
  podiumError: PodiumActionFailedReason | null;
  /** Open reward chest; pushed by the server on reward-chest use. */
  rewardChest: RewardChestStateMessage | null;
  rewardError: RewardActionFailedReason | null;
  /** Wall clock captured when the chest state arrived; drives expiry labels. */
  rewardChestOpenedAtMs: number;
  /** Open daily-rewards window; pushed by the server on shrine use. */
  dailyRewards: DailyRewardsStateMessage | null;
  dailyError: DailyActionFailedReason | null;
  /** Claim history; undefined until the window asks for it. */
  dailyHistory: ReadonlyArray<DailyRewardHistoryEntry> | undefined;
  questLogOpen: boolean;
  questLog: QuestLogMessage | null;
  questLine: QuestLineMessage | null;
  questLogError: QuestLogFailedReason | null;
  profileWindowOpen: boolean;
  publicProfileOpen: boolean;
  bugReportOpen: boolean;
  achievementToast: AchievementToast | null;
  reportSession: ReportSessionState | null;
  houseToast: HouseToast | null;
  tradeToast: TradeClosedReason | null;
  itemText: ItemTextState | null;
  npcDialogue: NpcDialogueState | null;
  npcTravelPending: boolean;
  bankSession: BankSessionState | null;
  shopSession: ShopSessionState | null;
  storeOpen: boolean;
  storeSession: StoreSessionState | null;
  mailboxSession: MailboxSessionState | null;
  lootSessions: ReadonlyArray<LootSessionState>;
  gameMenuOpen: boolean;
  languageSaving: boolean;
  languageError: boolean;
  serverError: ServerErrorCode | null;
  /** Place in the server's login queue while the world is full; null = seated. */
  loginQueue: { readonly position: number; readonly total: number } | null;
  runeTargeting: boolean;
  potionTargeting: boolean;
  useWithTargeting: boolean;
  mapContextMenu: MapContextMenuState | null;
  screenMessage: ScreenMessageState | null;
}
