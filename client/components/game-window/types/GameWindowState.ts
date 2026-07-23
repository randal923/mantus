import type {
  AccountTier,
  ActionBar,
  ActionBotSettings,
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  FightState,
  OwnCharacterState,
  ServerErrorCode,
  SpellCatalogEntry,
  TradeClosedReason,
  UiSettings,
} from "@tibia/protocol";
import type { ChatState } from "../../../lib/chat/chatReducer";
import type { BankSessionState } from "./BankSessionState";
import type { GameWindowRuntime } from "./GameWindowRuntime";
import type { GameWindowSessionActions } from "./GameWindowSessionActions";
import type { GameWindowSessions } from "./GameWindowSessions";
import type { GuildToast } from "./GuildToast";
import type { HouseToast } from "./HouseToast";
import type { ItemTextState } from "./ItemTextState";
import type { LevelUpNotice } from "./LevelUpNotice";
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
  creationOptions: CharacterCreationOptions | null;
  ownCharacter: OwnCharacterState | null;
  worldLoading: boolean;
  worldLoadProgress: WorldLoadProgress | null;
  visibleCreatures: ReadonlyArray<CreatureState>;
  fightState: FightState | null;
  spells: ReadonlyArray<SpellCatalogEntry>;
  combatLog: ReadonlyArray<string>;
  levelUpNotice: LevelUpNotice | null;
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
  lootSession: LootSessionState | null;
  gameMenuOpen: boolean;
  languageSaving: boolean;
  languageError: boolean;
  serverError: ServerErrorCode | null;
  runeTargeting: boolean;
  potionTargeting: boolean;
  useWithTargeting: boolean;
  mapContextMenu: MapContextMenuState | null;
  screenMessage: ScreenMessageState | null;
}
