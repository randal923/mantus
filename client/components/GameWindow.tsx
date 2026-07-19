"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  ActionBar,
  BankActionFailedReason,
  DepotStateMessage,
  MailActionFailedReason,
  ReportActionFailedReason,
  ShopActionFailedReason,
  ShopEntryProjection,
  ShopTransactedMessage,
  CharacterCreationOptions,
  CharacterSummary,
  CreatureState,
  CreateCharacterInput,
  FightState,
  InventoryItem,
  InventoryState,
  OwnCharacterState,
  ServerErrorCode,
  ServerMessage,
  SpellCatalogEntry,
  TradeClosedReason,
  MinimapLayout,
  UiSettings,
} from "@tibia/protocol";
import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import { i18n } from "../i18n/i18n";
import { useAppTranslation } from "../i18n/useAppTranslation";
import { useHotkeys } from "../hooks/useHotkeys";
import { useDepotSession } from "../hooks/useDepotSession";
import { useGuildSession } from "../hooks/useGuildSession";
import { useHighscoresSession } from "../hooks/useHighscoresSession";
import { useHouseSession } from "../hooks/useHouseSession";
import { useMarketSession } from "../hooks/useMarketSession";
import { usePartySession } from "../hooks/usePartySession";
import { useVipSession } from "../hooks/useVipSession";
import { useTradeSession } from "../hooks/useTradeSession";
import { useOptimisticInventory } from "../hooks/useOptimisticInventory";
import type { DepotAction } from "../lib/depot/DepotAction";
import type {
  PendingItemOp,
  PendingItemOpIntent,
} from "../lib/inventory/PendingItemOp";
import {
  chatReducer,
  initialChatState,
  GUILD_CHANNEL_ID,
  LOCAL_CHANNEL_ID,
  PARTY_CHANNEL_ID,
  SYSTEM_CHANNEL_ID,
} from "../lib/chat/chatReducer";
import { formatChatTime } from "../lib/chat/formatChatTime";
import { parseChatInput } from "../lib/chat/parseChatInput";
import { sanitizeChatText } from "../lib/chat/sanitizeChatText";
import { toChatMessage } from "../lib/chat/toChatMessage";
import type { ConnectionStatus, GameClient } from "../lib/net/GameClient";
import type { WorldRenderer } from "../lib/render/WorldRenderer";
import { updateVisibleCreatures } from "../lib/creatures/updateVisibleCreatures";
import { isEditableTarget } from "../lib/hotkeys/isEditableTarget";
import { useLanguageStore } from "../stores/useLanguageStore";
import { getRuneCombatTarget } from "../lib/combat/getRuneCombatTarget";
import { getHeldMovementDirection } from "../lib/movement/getHeldMovementDirection";
import { exceedsCapacity } from "../lib/inventory/exceedsCapacity";
import { toInventoryItemPresentation } from "../lib/inventory/toInventoryItemPresentation";
import { validateItemOp } from "../lib/inventory/validateItemOp";
import type { ShopCoinWeights } from "../lib/shop/ShopCoinWeights";
import { precheckShopPurchase } from "../lib/shop/precheckShopPurchase";
import { precheckShopSale } from "../lib/shop/precheckShopSale";
import { toAuctionHistoryEntry } from "../lib/market/toAuctionHistoryEntry";
import { toAuctionHouseItem } from "../lib/market/toAuctionHouseItem";
import { toAuctionOffer } from "../lib/market/toAuctionOffer";
import { toAuctionOwnOffer } from "../lib/market/toAuctionOwnOffer";
import { CharacterSelectScreen } from "./characters/CharacterSelectScreen";
import { GameHud } from "./GameHud";
import { ActionBarModal } from "./spells/ActionBarModal";
import { InventoryPanel } from "./inventory/InventoryPanel";
import { LootPanel } from "./inventory/LootPanel";
import { ItemTextModal } from "./inventory/ItemTextModal";
import type { ItemDragSource } from "./inventory/ItemDragSource";
import { TopNavigationBar } from "./navigation/TopNavigationBar";
import { GameMenuModal } from "./settings/GameMenuModal";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import { NpcDialogue } from "./npc/NpcDialogue";
import { BankPanel } from "./bank/BankPanel";
import { ShopPanel } from "./shop/ShopPanel";
import { DepotModal } from "./depot/DepotModal";
import { MailboxModal } from "./depot/MailboxModal";
import { AuctionHouseModal } from "./auction/AuctionHouseModal";
import { TradePanel } from "./trade/TradePanel";
import { GuildModal } from "./guild/GuildModal";
import { HouseModal } from "./house/HouseModal";
import { HighscoresModal } from "./social/HighscoresModal";
import { ReportPlayerModal } from "./social/ReportPlayerModal";
import { VipPanel } from "./social/VipPanel";
import { PartyPanel } from "./party/PartyPanel";
import { PartyInvitationToast } from "./party/PartyInvitationToast";
import { Toast } from "./ui/Toast";
import { LevelUpBanner } from "./LevelUpBanner";

interface BankSessionState {
  npcId: string;
  npcName: string;
  balance: number;
  pending: boolean;
  error: BankActionFailedReason | null;
}

interface ShopSessionState {
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

interface MailboxSessionState {
  sessionId: string;
  pending: boolean;
  error: MailActionFailedReason | null;
  sentRecipient: string | null;
}

interface ReportSessionState {
  targetName: string;
  pending: boolean;
  error: ReportActionFailedReason | null;
  sent: boolean;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

interface GameWindowProps {
  accessToken: string;
  onLogout: () => void | Promise<void>;
}

export default function GameWindow({ accessToken, onLogout }: GameWindowProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const diagonalWalking = useGameSettingsStore(
    (state) => state.diagonalWalking,
  );
  const setDiagonalWalking = useGameSettingsStore(
    (state) => state.setDiagonalWalking,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GameClient | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const languageRef = useRef(language);
  const confirmedLanguageRef = useRef(language);
  const joinedRef = useRef(false);
  const confirmedLevelRef = useRef<{
    readonly playerId: string;
    readonly level: number;
  } | null>(null);
  const levelUpSequenceRef = useRef(0);
  const resumeCharacterIdRef = useRef<string | null>(null);
  const pendingRuneRef = useRef<InventoryItem | null>(null);
  const itemDragRef = useRef<ItemDragSource | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [characters, setCharacters] = useState<
    ReadonlyArray<CharacterSummary> | null
  >(null);
  const [creationOptions, setCreationOptions] =
    useState<CharacterCreationOptions | null>(null);
  const [ownCharacter, setOwnCharacter] =
    useState<OwnCharacterState | null>(null);
  const [visibleCreatures, setVisibleCreatures] = useState<
    ReadonlyArray<CreatureState>
  >([]);
  // Mirror for closures that must read creature kinds synchronously
  // (drag-onto-player trade initiation inside the renderer callbacks).
  const visibleCreaturesRef = useRef<ReadonlyArray<CreatureState>>([]);
  const [fightState, setFightState] = useState<FightState | null>(null);
  const [spells, setSpells] = useState<ReadonlyArray<SpellCatalogEntry>>([]);
  const [combatLog, setCombatLog] = useState<ReadonlyArray<string>>([]);
  const [levelUpNotice, setLevelUpNotice] = useState<{
    readonly id: number;
    readonly level: number;
  } | null>(null);
  const [chatState, dispatchChat] = useReducer(chatReducer, initialChatState);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [characterStatsOpen, setCharacterStatsOpen] = useState(false);
  const [battleListVisible, setBattleListVisible] = useState(true);
  const [minimapVisible, setMinimapVisible] = useState(true);
  const [mapName, setMapName] = useState<string | null>(null);
  const [uiSettings, setUiSettings] = useState<UiSettings>({});
  const uiSettingsRef = useRef<UiSettings>({});
  const uiSettingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [actionBar, setActionBar] = useState<ActionBar>([]);
  const actionBarRef = useRef<ActionBar>([]);
  const actionBarSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Slot preselected in the assignment modal; null = modal closed. */
  const [actionBarConfigSlot, setActionBarConfigSlot] = useState<number | null>(
    null,
  );
  const handleActionBarChange = useCallback((next: ActionBar) => {
    setActionBar(next);
    actionBarRef.current = next;
    if (actionBarSaveTimerRef.current) {
      clearTimeout(actionBarSaveTimerRef.current);
    }
    actionBarSaveTimerRef.current = setTimeout(() => {
      actionBarSaveTimerRef.current = null;
      clientRef.current?.updateActionBar(actionBarRef.current);
    }, 800);
  }, []);
  const handleMinimapLayoutChange = useCallback((layout: MinimapLayout) => {
    setUiSettings((current) => {
      const next = { ...current, minimap: layout };
      uiSettingsRef.current = next;
      return next;
    });
    if (uiSettingsSaveTimerRef.current) {
      clearTimeout(uiSettingsSaveTimerRef.current);
    }
    uiSettingsSaveTimerRef.current = setTimeout(() => {
      uiSettingsSaveTimerRef.current = null;
      clientRef.current?.updateUiSettings(uiSettingsRef.current);
    }, 800);
  }, []);
  const sendItemIntent = useCallback(
    (intent: PendingItemOpIntent) =>
      clientRef.current?.sendItemIntent(intent) ?? false,
    [],
  );
  const discardStaleMapPreviews = useCallback((op: PendingItemOp) => {
    if (op.kind === "drop" || op.kind === "pickup" || op.kind === "move-map") {
      rendererRef.current?.clearMapItemPreviews();
    }
  }, []);
  const ownCharacterRef = useRef<OwnCharacterState | null>(null);
  useEffect(() => {
    ownCharacterRef.current = ownCharacter;
  }, [ownCharacter]);
  const validateItemOpLocally = useCallback(
    (op: PendingItemOp, projected: InventoryState) => {
      const character = ownCharacterRef.current;
      return character ? validateItemOp(op, projected, character) : null;
    },
    [],
  );
  const {
    inventory,
    reset: resetInventory,
    confirm: confirmInventory,
    rollback: rollbackInventory,
    patch: patchInventory,
    preview: previewInventory,
    rejectPreview: rejectInventoryPreview,
    clearPreviews: clearInventoryPreviews,
    getConfirmedItem,
    dispatch: dispatchItemOp,
  } = useOptimisticInventory(
    sendItemIntent,
    discardStaleMapPreviews,
    validateItemOpLocally,
  );
  const dispatchItemOpChecked = useCallback(
    (op: PendingItemOp): boolean => {
      const rejection = dispatchItemOp(op);
      if (!rejection) return true;
      setCombatLog((current) =>
        [...current, i18n.t(`inventory.rejections.${rejection}`)].slice(-6),
      );
      return false;
    },
    [dispatchItemOp],
  );
  const sendDepotAction = useCallback(
    (action: DepotAction, state: DepotStateMessage): boolean => {
      if (action.kind === "deposit") {
        const item = getConfirmedItem(action.item.id);
        return item
          ? (clientRef.current?.depositInDepot(state, item) ?? false)
          : false;
      }
      if (action.kind === "withdraw") {
        return (
          clientRef.current?.withdrawFromDepot(state, action.entry) ?? false
        );
      }
      if (action.kind === "stash-deposit") {
        const item = getConfirmedItem(action.item.id);
        return item
          ? (clientRef.current?.depositInStash(state, item, action.count) ??
              false)
          : false;
      }
      return (
        clientRef.current?.withdrawFromStash(
          state,
          action.entry.itemTypeId,
          action.count,
        ) ?? false
      );
    },
    [getConfirmedItem],
  );
  const {
    session: depotSession,
    confirm: confirmDepot,
    fail: failDepot,
    beginBrowse: beginDepotBrowse,
    enqueue: enqueueDepotAction,
    reject: rejectDepotAction,
    close: closeDepot,
    reset: resetDepot,
  } = useDepotSession(sendDepotAction);
  const {
    session: marketSession,
    opened: confirmMarketOpened,
    offersReceived: confirmMarketOffers,
    ownOffersReceived: confirmMarketOwnOffers,
    historyReceived: confirmMarketHistory,
    transacted: confirmMarketTransacted,
    fail: failMarket,
    begin: beginMarketAction,
    reset: resetMarket,
  } = useMarketSession();
  const marketOpenRef = useRef(false);
  const marketSelectedItemRef = useRef<number | null>(null);
  // Mirrors marketSelectedItemRef for rendering; the ref stays because the
  // socket onMessage closure reads the latest value synchronously.
  const [marketSelectedItem, setMarketSelectedItem] = useState<string | null>(
    null,
  );
  const [marketToast, setMarketToast] = useState<
    "created" | "accepted" | "cancelled" | null
  >(null);
  const dismissMarketToast = useCallback(() => setMarketToast(null), []);
  const closeMarket = useCallback(() => {
    marketOpenRef.current = false;
    marketSelectedItemRef.current = null;
    setMarketSelectedItem(null);
    resetMarket();
  }, [resetMarket]);
  const {
    session: tradeSession,
    stateReceived: confirmTradeState,
    fail: failTrade,
    begin: beginTradeAction,
    reset: resetTrade,
  } = useTradeSession();
  const {
    state: partySession,
    stateReceived: confirmPartyState,
    invitationReceived: partyInvitationReceived,
    invitationRevoked: partyInvitationRevoked,
    fail: failParty,
    reset: resetParty,
  } = usePartySession();
  const [partyPanelVisible, setPartyPanelVisible] = useState(false);
  const hadPartyRef = useRef(false);
  const {
    state: guildSession,
    stateReceived: confirmGuildState,
    invitationReceived: guildInvitationReceived,
    fail: failGuild,
    reset: resetGuild,
  } = useGuildSession();
  const [guildModalOpen, setGuildModalOpen] = useState(false);
  const hadGuildRef = useRef(false);
  const [guildToast, setGuildToast] = useState<{
    readonly kind: string;
    readonly detail: string;
  } | null>(null);
  const dismissGuildToast = useCallback(() => setGuildToast(null), []);
  const {
    state: houseSession,
    stateReceived: confirmHouseState,
    listReceived: houseListReceived,
    offerReceived: houseOfferReceived,
    offerResolved: houseOfferResolved,
    offerCancelledByName: houseOfferCancelledByName,
    fail: failHouse,
    reset: resetHouse,
  } = useHouseSession();
  const [houseModalOpen, setHouseModalOpen] = useState(false);
  const {
    state: vipSession,
    stateReceived: confirmVipState,
    statusChanged: vipStatusChanged,
    fail: failVip,
    reset: resetVip,
  } = useVipSession();
  const [vipPanelVisible, setVipPanelVisible] = useState(false);
  const [vipToast, setVipToast] = useState<string | null>(null);
  const dismissVipToast = useCallback(() => setVipToast(null), []);
  const {
    state: highscoresSession,
    stateReceived: confirmHighscoresState,
    begin: beginHighscores,
    fail: failHighscores,
    reset: resetHighscores,
  } = useHighscoresSession();
  const [highscoresOpen, setHighscoresOpen] = useState(false);
  const [reportSession, setReportSession] =
    useState<ReportSessionState | null>(null);
  const [houseToast, setHouseToast] = useState<{
    readonly kind: string;
    readonly houseName: string;
    readonly detail: string;
    readonly warningsLeft?: number;
  } | null>(null);
  const dismissHouseToast = useCallback(() => setHouseToast(null), []);
  const [tradeToast, setTradeToast] = useState<TradeClosedReason | null>(null);
  const dismissTradeToast = useCallback(() => setTradeToast(null), []);
  const [itemText, setItemText] = useState<
    Extract<ServerMessage, { type: "item-text" }> | null
  >(null);
  const [npcDialogue, setNpcDialogue] = useState<
    Extract<ServerMessage, { type: "npc-dialogue" }> | null
  >(null);
  const [bankSession, setBankSession] = useState<BankSessionState | null>(
    null,
  );
  const [shopSession, setShopSession] = useState<ShopSessionState | null>(
    null,
  );
  const [mailboxSession, setMailboxSession] =
    useState<MailboxSessionState | null>(null);
  const [lootSession, setLootSession] = useState<
    Extract<ServerMessage, { type: "world-container-state" }> | null
  >(null);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const [serverError, setServerError] = useState<ServerErrorCode | null>(null);
  const [runeTargeting, setRuneTargeting] = useState(false);
  const marketItemOffers = marketSession?.itemOffers ?? null;

  const reconnect = (characterId: string | null) => {
    resumeCharacterIdRef.current = characterId;
    joinedRef.current = false;
    setStatus("connecting");
    setCharacters(null);
    setCreationOptions(null);
    setOwnCharacter(null);
    resetInventory(null);
    setItemText(null);
    setNpcDialogue(null);
    setBankSession(null);
    setShopSession(null);
    resetDepot();
    closeMarket();
    resetParty();
    hadPartyRef.current = false;
    setPartyPanelVisible(false);
    resetGuild();
    hadGuildRef.current = false;
    setGuildModalOpen(false);
    setGuildToast(null);
    resetHouse();
    setHouseModalOpen(false);
    setHouseToast(null);
    resetVip();
    setVipPanelVisible(false);
    setVipToast(null);
    resetHighscores();
    setHighscoresOpen(false);
    setReportSession(null);
    setMailboxSession(null);
    setVisibleCreatures([]);
    setFightState(null);
    setSpells([]);
    setActionBar([]);
    actionBarRef.current = [];
    setActionBarConfigSlot(null);
    setCombatLog([]);
    dispatchChat({ type: "reset", ownPlayerId: null, ownName: null });
    setCharacterBusy(characterId !== null);
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen(false);
    itemDragRef.current = null;
    setServerError(null);
    setConnectionAttempt((attempt) => attempt + 1);
  };

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useHotkeys((action) => {
    if (!ownCharacter) return;
    if (action === "toggleInventory") {
      if (gameMenuOpen) return;
      setCharacterStatsOpen(false);
      setInventoryOpen((open) => !open);
      return;
    }
    if (action === "togglePartyPanel") {
      if (gameMenuOpen) return;
      setPartyPanelVisible((visible) => !visible);
      return;
    }
    if (action === "toggleGuildModal") {
      if (gameMenuOpen) return;
      setGuildModalOpen((open) => {
        if (!open) clientRef.current?.openGuild();
        return !open;
      });
      return;
    }
    if (action === "toggleVipPanel") {
      if (gameMenuOpen) return;
      setVipPanelVisible((visible) => !visible);
      return;
    }
    if (action === "toggleHouseModal") {
      if (gameMenuOpen) return;
      setHouseModalOpen((open) => {
        if (!open) clientRef.current?.openHouse();
        return !open;
      });
      return;
    }
    if (action === "toggleCharacterStats") {
      setGameMenuOpen(false);
      if (characterStatsOpen) {
        setCharacterStatsOpen(false);
        setInventoryOpen(false);
        return;
      }
      setInventoryOpen(true);
      setCharacterStatsOpen(true);
      return;
    }
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen((open) => !open);
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let client: GameClient | undefined;
    let renderer: WorldRenderer | undefined;
    let heldMovementKeys: ReadonlyArray<string> = [];
    joinedRef.current = false;

    const syncViewport = () => {
      const range = renderer?.setViewportSize(
        container.clientWidth,
        container.clientHeight,
      );
      if (range) client?.setViewport(range);
    };
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(container);

    (async () => {
      const [{ GameClient }, { WorldRenderer }] = await Promise.all([
        import("../lib/net/GameClient"),
        import("../lib/render/WorldRenderer"),
      ]);
      if (disposed) return;

      const worldRenderer = new WorldRenderer({
        useMap: (position) => client?.useMap(position),
        attackTarget: (creatureId) => client?.attackTarget(creatureId),
        cancelAttack: () => client?.cancelAttack(),
        pickupMapItem: (item, position) => {
          const queued = dispatchItemOpChecked({
            kind: "pickup",
            itemId: item.instanceId,
            revision: item.revision,
            position,
            ...(item.weight !== undefined
              ? { weight: item.weight * item.count }
              : {}),
          });
          if (queued) {
            rendererRef.current?.previewMapItemRemoval(
              position,
              item.instanceId,
            );
          }
        },
        beginMapItemDrag: (item, position) => {
          const source = { kind: "world", item, position } as const;
          itemDragRef.current = source;
        },
        endItemDrag: () => {
          itemDragRef.current = null;
        },
        dropDraggedItemOnCreature: (creatureId) => {
          const source = itemDragRef.current;
          if (source?.kind !== "owned") return false;
          const creature = visibleCreaturesRef.current.find(
            (candidate) => candidate.id === creatureId,
          );
          if (creature?.kind !== "player") return false;
          return (
            client?.requestTrade(
              creatureId,
              source.item.id,
              source.item.revision,
            ) ?? false
          );
        },
        dropDraggedItem: (position) => {
          const source = itemDragRef.current;
          if (source?.kind === "owned") {
            const queued = dispatchItemOpChecked({
              kind: "drop",
              itemId: source.item.id,
              position,
            });
            if (queued) {
              rendererRef.current?.previewMapItemAddition(position, {
                instanceId: source.item.id,
                itemId: source.item.clientId,
                revision: source.item.revision,
                count: source.item.count,
              });
            }
          } else if (
            source?.kind === "world" &&
            (source.position.x !== position.x ||
              source.position.y !== position.y ||
              source.position.z !== position.z)
          ) {
            const queued = dispatchItemOpChecked({
              kind: "move-map",
              itemId: source.item.instanceId,
              revision: source.item.revision,
              fromPosition: source.position,
              toPosition: position,
            });
            if (queued) {
              rendererRef.current?.previewMapItemRemoval(
                source.position,
                source.item.instanceId,
              );
              rendererRef.current?.previewMapItemAddition(
                position,
                source.item,
              );
            }
          }
          itemDragRef.current = null;
        },
        autoWalk: (directions) => client?.autoWalk(directions),
        targetPosition: (position) => {
          const rune = pendingRuneRef.current;
          if (!rune) return false;
          pendingRuneRef.current = null;
          setRuneTargeting(false);
          client?.useRune(rune, { kind: "position", position });
          return true;
        },
      });
      await worldRenderer.init(container);
      if (disposed) {
        worldRenderer.destroy();
        return;
      }
      renderer = worldRenderer;
      rendererRef.current = worldRenderer;
      syncViewport();

      client = new GameClient(WS_URL, {
        onMessage: (message) => {
          if (disposed) return;
          setVisibleCreatures((current) => {
            const next = updateVisibleCreatures(current, message);
            visibleCreaturesRef.current = next;
            return next;
          });
          if (message.type === "character-list") {
            setCharacters(message.characters);
            setCreationOptions(message.creationOptions);
            setServerError(null);
            const resumeCharacterId = resumeCharacterIdRef.current;
            if (resumeCharacterId) {
              const canResume = message.characters.some(
                (character) => character.id === resumeCharacterId,
              );
              if (canResume && client?.selectCharacter(resumeCharacterId)) {
                setCharacterBusy(true);
                return;
              }
              resumeCharacterIdRef.current = null;
              setServerError("character-load-failed");
            }
            setCharacterBusy(false);
            return;
          }
          if (message.type === "welcome") {
            joinedRef.current = true;
            confirmedLevelRef.current = {
              playerId: message.playerId,
              level: message.character.level,
            };
            setLevelUpNotice(null);
            resumeCharacterIdRef.current = null;
            setOwnCharacter(message.character);
            setMapName(message.map.name);
            setUiSettings(message.uiSettings);
            uiSettingsRef.current = message.uiSettings;
            resetInventory(message.inventory);
            setFightState(message.fightState);
            setSpells(message.spells);
            setActionBar(message.actionBar);
            actionBarRef.current = message.actionBar;
            setActionBarConfigSlot(null);
            setCharacterBusy(false);
            setServerError(null);
            setNpcDialogue(null);
            setBankSession(null);
            setShopSession(null);
            resetDepot();
            closeMarket();
            resetTrade();
            resetParty();
            hadPartyRef.current = false;
            setPartyPanelVisible(false);
            resetGuild();
            hadGuildRef.current = false;
            setGuildModalOpen(false);
            setGuildToast(null);
            resetHouse();
            setHouseModalOpen(false);
            setHouseToast(null);
            resetVip();
            setVipPanelVisible(false);
            setVipToast(null);
            resetHighscores();
            setHighscoresOpen(false);
            setReportSession(null);
            setMailboxSession(null);
            setLootSession(null);
            dispatchChat({
              type: "reset",
              ownPlayerId: message.playerId,
              ownName: message.character.name,
            });
          }
          if (message.type === "creature-spoke") {
            dispatchChat({
              type: "spoke",
              creatureId: message.creatureId,
              name: message.name,
              mode: message.mode,
              body: message.text,
              time: formatChatTime(),
            });
          }
          if (message.type === "npc-dialogue") {
            setNpcDialogue(message);
            dispatchChat({
              type: "spoke",
              creatureId: message.npcId,
              name: message.npcName,
              mode: "say",
              body: message.text,
              time: formatChatTime(),
            });
          }
          if (message.type === "npc-dialogue-closed") {
            setNpcDialogue((current) =>
              current?.npcId === message.npcId &&
              current.conversationId === message.conversationId
                ? null
                : current,
            );
            setShopSession((current) =>
              current?.npcId === message.npcId ? null : current,
            );
          }
          if (message.type === "bank-opened") {
            setShopSession(null);
            resetDepot();
            closeMarket();
            setMailboxSession(null);
            setBankSession({
              npcId: message.npcId,
              npcName: message.npcName,
              balance: message.balance,
              pending: false,
              error: null,
            });
            return;
          }
          if (message.type === "bank-updated") {
            setBankSession((current) =>
              current
                ? {
                    ...current,
                    balance: message.balance,
                    pending: false,
                    error: null,
                  }
                : current,
            );
            return;
          }
          if (message.type === "bank-action-failed") {
            setBankSession((current) => {
              if (!current) return current;
              if (message.reason === "out-of-range") return null;
              return { ...current, pending: false, error: message.reason };
            });
            return;
          }
          if (message.type === "shop-opened") {
            setBankSession(null);
            resetDepot();
            closeMarket();
            setMailboxSession(null);
            setShopSession((current) => {
              if (message.page === 1) {
                return {
                  npcId: message.npcId,
                  npcName: message.npcName,
                  shopSessionId: message.shopSessionId,
                  currencyItemTypeId: message.currencyItemTypeId,
                  currencySpriteId: message.currencySpriteId,
                  currencyName: message.currencyName,
                  currencyAmount: message.currencyAmount,
                  currencyWeight: message.currencyWeight,
                  coinWeights: message.coinWeights,
                  pageCount: message.pageCount,
                  nextPage: 2,
                  entries: message.entries,
                  pending: false,
                  error: null,
                  lastTransaction: null,
                  pendingPurchaseCost: 0,
                };
              }
              if (
                !current ||
                current.shopSessionId !== message.shopSessionId ||
                current.pageCount !== message.pageCount ||
                current.nextPage !== message.page ||
                current.currencyItemTypeId !== message.currencyItemTypeId
              ) {
                return current;
              }
              return {
                ...current,
                entries: [...current.entries, ...message.entries],
                nextPage: current.nextPage + 1,
              };
            });
            return;
          }
          if (message.type === "shop-transacted") {
            setShopSession((current) =>
              current
                ? {
                    ...current,
                    pending: false,
                    error: null,
                    lastTransaction: message,
                    pendingPurchaseCost: 0,
                    currencyAmount:
                      current.currencyItemTypeId === GOLD_COIN_TYPE_ID
                        ? current.currencyAmount
                        : Math.max(
                            0,
                            current.currencyAmount +
                              (message.kind === "sale"
                                ? message.totalPrice
                                : -message.totalPrice),
                          ),
                  }
                : current,
            );
            return;
          }
          if (message.type === "shop-action-failed") {
            rejectInventoryPreview();
            setShopSession((current) => {
              if (!current) return current;
              if (
                message.reason === "out-of-range" ||
                message.reason === "unavailable"
              ) {
                return null;
              }
              return {
                ...current,
                pending: false,
                error: message.reason,
                pendingPurchaseCost: 0,
              };
            });
            return;
          }
          if (message.type === "depot-state") {
            setBankSession(null);
            setShopSession(null);
            setMailboxSession(null);
            confirmDepot(message);
            return;
          }
          if (message.type === "depot-action-failed") {
            failDepot(message.reason);
            return;
          }
          if (message.type === "market-opened") {
            const wasOpen = marketOpenRef.current;
            marketOpenRef.current = true;
            confirmMarketOpened(message);
            if (message.page < message.pageCount) {
              client?.openMarket(message.page + 1);
            }
            if (message.page === 1 && !wasOpen) {
              // Own offers and history arrive pushed alongside page 1.
              // Refreshes while already open keep the current selection
              // (including the deliberate "nothing selected" after creating
              // an offer) instead of re-selecting the first item.
              const firstItem = message.items[0];
              if (marketSelectedItemRef.current === null && firstItem) {
                marketSelectedItemRef.current = firstItem.itemTypeId;
                setMarketSelectedItem(String(firstItem.itemTypeId));
                client?.browseMarket(firstItem.itemTypeId);
              }
            }
            return;
          }
          if (message.type === "market-offers") {
            confirmMarketOffers(message);
            return;
          }
          if (message.type === "market-own-offers-state") {
            confirmMarketOwnOffers(message);
            return;
          }
          if (message.type === "market-own-history-state") {
            confirmMarketHistory(message);
            return;
          }
          if (message.type === "market-transacted") {
            confirmMarketTransacted(message);
            setMarketToast(message.kind);
            if (message.kind === "created") {
              // Deselect after creating an offer so the ticket clears; skip
              // the browse re-request for the cleared selection.
              marketSelectedItemRef.current = null;
              setMarketSelectedItem(null);
            }
            if (marketOpenRef.current) {
              client?.openMarket(1);
              const selectedItemTypeId = marketSelectedItemRef.current;
              if (selectedItemTypeId !== null) {
                client?.browseMarket(selectedItemTypeId);
              }
            }
            return;
          }
          if (message.type === "market-action-failed") {
            failMarket(message.reason);
            return;
          }
          if (message.type === "party-state") {
            const hadParty = hadPartyRef.current;
            hadPartyRef.current = message.party !== null;
            if (message.party && !hadParty) setPartyPanelVisible(true);
            if (!message.party && hadParty) {
              dispatchChat({ type: "party-closed" });
            }
            confirmPartyState(message);
            worldRenderer.setPartyView(
              message.party
                ? {
                    leaderId: message.party.leaderId,
                    memberIds: message.party.members.map(
                      (member) => member.id,
                    ),
                    sharedExpActive: message.party.sharedExpActive,
                  }
                : null,
            );
            return;
          }
          if (message.type === "party-invitation") {
            partyInvitationReceived(message);
            return;
          }
          if (message.type === "party-invitation-revoked") {
            partyInvitationRevoked(message.leaderId);
            return;
          }
          if (message.type === "party-chat-delivered") {
            dispatchChat({
              type: "party",
              speakerId: message.speakerId,
              name: message.speakerName,
              body: message.text,
              time: formatChatTime(),
            });
            return;
          }
          if (message.type === "party-action-failed") {
            failParty(message.reason);
            return;
          }
          if (message.type === "guild-state") {
            const hadGuild = hadGuildRef.current;
            hadGuildRef.current = message.guild !== null;
            if (!message.guild && hadGuild) {
              dispatchChat({ type: "guild-closed" });
            }
            confirmGuildState(message);
            worldRenderer.setGuildView(
              message.guild
                ? {
                    ownGuildName: message.guild.name,
                    enemyGuildNames: message.guild.wars
                      .filter((war) => war.status === "active")
                      .map((war) => war.enemyGuildName),
                  }
                : null,
            );
            return;
          }
          if (message.type === "guild-invitation") {
            guildInvitationReceived(message);
            return;
          }
          if (message.type === "guild-chat-delivered") {
            dispatchChat({
              type: "guild",
              speakerId: message.speakerId,
              name: message.speakerName,
              body: message.text,
              time: formatChatTime(),
              // Canary-style highlight for vice-leader/leader lines.
              highlighted: message.rankLevel >= 2,
            });
            return;
          }
          if (message.type === "guild-event") {
            setGuildToast({ kind: message.kind, detail: message.detail ?? "" });
            return;
          }
          if (message.type === "guild-action-failed") {
            failGuild(message.reason);
            return;
          }
          if (message.type === "house-state") {
            confirmHouseState(message);
            return;
          }
          if (message.type === "house-list") {
            houseListReceived(message);
            return;
          }
          if (message.type === "house-transfer-incoming") {
            houseOfferReceived(message);
            return;
          }
          if (message.type === "house-event") {
            if (message.kind === "transfer-cancelled") {
              houseOfferCancelledByName(message.houseName);
            }
            setHouseToast({
              kind: message.kind,
              houseName: message.houseName,
              detail: message.detail ?? "",
              ...(message.warningsLeft !== undefined
                ? { warningsLeft: message.warningsLeft }
                : {}),
            });
            return;
          }
          if (message.type === "house-action-failed") {
            failHouse(message.reason);
            return;
          }
          if (message.type === "vip-state") {
            confirmVipState(message);
            return;
          }
          if (message.type === "vip-status-changed") {
            const entry = vipStatusChanged(message);
            if (entry?.online && entry.notifyLogin) setVipToast(entry.name);
            return;
          }
          if (message.type === "vip-action-failed") {
            failVip(message.reason);
            return;
          }
          if (message.type === "highscores-state") {
            confirmHighscoresState(message);
            return;
          }
          if (message.type === "highscores-action-failed") {
            failHighscores(message.reason);
            return;
          }
          if (message.type === "report-received") {
            setReportSession((current) =>
              current
                ? { ...current, pending: false, error: null, sent: true }
                : current,
            );
            return;
          }
          if (message.type === "report-action-failed") {
            setReportSession((current) =>
              current
                ? { ...current, pending: false, error: message.reason }
                : current,
            );
            return;
          }
          if (message.type === "trade-state") {
            confirmTradeState(message);
            return;
          }
          if (message.type === "trade-closed") {
            setTradeToast(message.reason);
            resetTrade();
            return;
          }
          if (message.type === "trade-action-failed") {
            failTrade(message.reason);
            return;
          }
          if (message.type === "mailbox-opened") {
            setBankSession(null);
            setShopSession(null);
            resetDepot();
            closeMarket();
            setMailboxSession({
              sessionId: message.sessionId,
              pending: false,
              error: null,
              sentRecipient: null,
            });
            return;
          }
          if (message.type === "mail-sent") {
            setMailboxSession((current) =>
              current
                ? {
                    ...current,
                    pending: false,
                    error: null,
                    sentRecipient: message.recipientName,
                  }
                : current,
            );
            return;
          }
          if (message.type === "mail-action-failed") {
            setMailboxSession((current) => {
              if (!current) return current;
              if (message.reason === "out-of-range") return null;
              return { ...current, pending: false, error: message.reason };
            });
            return;
          }
          if (message.type === "private-chat-delivered") {
            dispatchChat({
              type: "private",
              direction: message.direction,
              counterpart: message.counterpart,
              body: message.text,
              time: formatChatTime(),
            });
            return;
          }
          if (message.type === "chat-rejected") {
            dispatchChat({
              type: "rejected",
              reason: message.reason,
              time: formatChatTime(),
              ...(message.retryAfterMs === undefined
                ? {}
                : { retryAfterMs: message.retryAfterMs }),
            });
            return;
          }
          if (message.type === "world-container-state") {
            setLootSession(message);
            setInventoryOpen(true);
            return;
          }
          if (message.type === "world-container-closed") {
            setLootSession((current) =>
              current?.state.container.id === message.containerId
                ? null
                : current,
            );
            return;
          }
          if (message.type === "inventory-updated") {
            confirmInventory(message.inventory);
            setShopSession((current) =>
              current?.currencyItemTypeId === GOLD_COIN_TYPE_ID
                ? { ...current, pendingPurchaseCost: 0 }
                : current,
            );
            return;
          }
          if (message.type === "item-text") {
            setItemText(message);
            return;
          }
          if (message.type === "attack-target-changed") {
            setFightState((current) =>
              current
                ? { ...current, attackTargetId: message.creatureId }
                : current,
            );
          }
          if (message.type === "fight-state") {
            setFightState(message.fightState);
          }
          if (message.type === "combat-log") {
            setCombatLog((current) => [...current, message.text].slice(-6));
          }
          if (message.type === "creature-left") {
            setFightState((current) =>
              current?.attackTargetId === message.creatureId
                ? { ...current, attackTargetId: null }
                : current,
            );
          }
          if (message.type === "progression-updated") {
            const previousLevel = confirmedLevelRef.current;
            confirmedLevelRef.current = {
              playerId: message.playerId,
              level: message.progression.level,
            };
            if (
              previousLevel?.playerId === message.playerId &&
              message.progression.level > previousLevel.level
            ) {
              levelUpSequenceRef.current += 1;
              setLevelUpNotice({
                id: levelUpSequenceRef.current,
                level: message.progression.level,
              });
            }
            setOwnCharacter((current) =>
              current?.id === message.playerId
                ? { ...current, ...message.progression }
                : current,
            );
            patchInventory((current) => ({
              ...current,
              capacityMax: message.progression.capacity,
            }));
            return;
          }
          if (
            message.type === "creature-moved" ||
            message.type === "position-correction"
          ) {
            const playerId =
              message.type === "creature-moved"
                ? message.creatureId
                : message.playerId;
            setOwnCharacter((current) =>
              current?.id === playerId
                ? {
                    ...current,
                    position: { ...message.position },
                    direction: message.direction,
                  }
                : current,
            );
          }
          worldRenderer.applyMessage(message);
        },
        onStatus: (nextStatus) => {
          if (disposed) return;
          if (nextStatus === "disconnected") joinedRef.current = false;
          if (nextStatus === "disconnected") confirmedLevelRef.current = null;
          if (nextStatus === "disconnected") setLevelUpNotice(null);
          if (nextStatus === "disconnected") setVisibleCreatures([]);
          if (nextStatus === "disconnected") setFightState(null);
          if (nextStatus === "disconnected") setSpells([]);
          if (nextStatus === "disconnected") {
            setActionBar([]);
            actionBarRef.current = [];
            setActionBarConfigSlot(null);
          }
          if (nextStatus === "disconnected") setCombatLog([]);
          if (nextStatus === "disconnected") setItemText(null);
          if (nextStatus === "disconnected") setNpcDialogue(null);
          if (nextStatus === "disconnected") resetDepot();
          if (nextStatus === "disconnected") closeMarket();
          if (nextStatus === "disconnected") {
            resetParty();
            hadPartyRef.current = false;
          }
          if (nextStatus === "disconnected") {
            resetGuild();
            hadGuildRef.current = false;
            setGuildModalOpen(false);
            setGuildToast(null);
          }
          if (nextStatus === "disconnected") {
            resetHouse();
            setHouseModalOpen(false);
            setHouseToast(null);
          }
          if (nextStatus === "disconnected") {
            resetVip();
            setVipPanelVisible(false);
            setVipToast(null);
            resetHighscores();
            setHighscoresOpen(false);
            setReportSession(null);
          }
          if (nextStatus === "disconnected") setMailboxSession(null);
          if (nextStatus === "disconnected") clearInventoryPreviews();
          if (nextStatus === "disconnected") {
            dispatchChat({ type: "reset", ownPlayerId: null, ownName: null });
          }
          setStatus(nextStatus);
        },
        onLanguage: (nextLanguage) => {
          if (disposed) return;
          confirmedLanguageRef.current = nextLanguage;
          setLanguage(nextLanguage);
          setLanguageSaving(false);
          setLanguageError(false);
        },
        onError: (code) => {
          if (disposed) return;
          if (code === "item-action-failed") {
            rollbackInventory();
            worldRenderer.clearMapItemPreviews();
          }
          if (code === "language-update-failed") {
            setLanguage(confirmedLanguageRef.current);
            setLanguageSaving(false);
            setLanguageError(true);
            return;
          }
          if (
            code === "ui-settings-update-failed" ||
            code === "ui-settings-update-pending"
          ) {
            // Layout saves are best-effort; never interrupt play over them.
            return;
          }
          resumeCharacterIdRef.current = null;
          if (code !== "language-update-pending") setLanguageSaving(false);
          setCharacterBusy(false);
          setServerError(code);
        },
      });
      clientRef.current = client;
      syncViewport();
      client.connect(accessToken, languageRef.current);
    })();

    const sendHeldDirection = (queueStep: boolean) => {
      const direction = getHeldMovementDirection(
        heldMovementKeys,
        useGameSettingsStore.getState().diagonalWalking,
      );
      if (!direction) return;
      client?.sendMove(direction, queueStep);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const direction = getHeldMovementDirection(
        [event.code],
        useGameSettingsStore.getState().diagonalWalking,
      );
      if (
        !direction ||
        !joinedRef.current ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (heldMovementKeys.includes(event.code)) return;
      heldMovementKeys = [...heldMovementKeys, event.code];
      sendHeldDirection(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!getHeldMovementDirection([event.code], true)) return;
      if (!joinedRef.current) return;
      if (
        isEditableTarget(event.target) &&
        !heldMovementKeys.includes(event.code)
      ) {
        return;
      }
      event.preventDefault();
      const wasActive =
        heldMovementKeys[heldMovementKeys.length - 1] === event.code;
      heldMovementKeys = heldMovementKeys.filter(
        (keyCode) => keyCode !== event.code,
      );
      if (!wasActive) return;
      if (heldMovementKeys.length > 0) {
        sendHeldDirection(false);
        return;
      }
      client?.stopMoving();
    };

    const onBlur = () => {
      if (heldMovementKeys.length === 0) return;
      heldMovementKeys = [];
      client?.stopMoving();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      resizeObserver.disconnect();
      client?.disconnect();
      clientRef.current = null;
      renderer?.destroy();
      rendererRef.current = null;
      joinedRef.current = false;
    };
  }, [
    accessToken,
    connectionAttempt,
    setLanguage,
    resetInventory,
    confirmInventory,
    patchInventory,
    clearInventoryPreviews,
    rejectInventoryPreview,
    rollbackInventory,
    dispatchItemOp,
    dispatchItemOpChecked,
    resetDepot,
    confirmDepot,
    failDepot,
    closeMarket,
    confirmMarketOpened,
    confirmMarketOffers,
    confirmMarketOwnOffers,
    confirmMarketHistory,
    confirmMarketTransacted,
    failMarket,
    confirmTradeState,
    failTrade,
    resetTrade,
    confirmPartyState,
    partyInvitationReceived,
    partyInvitationRevoked,
    failParty,
    resetParty,
    confirmGuildState,
    guildInvitationReceived,
    failGuild,
    resetGuild,
    confirmHouseState,
    houseListReceived,
    houseOfferReceived,
    houseOfferCancelledByName,
    failHouse,
    resetHouse,
    confirmVipState,
    vipStatusChanged,
    failVip,
    resetVip,
    confirmHighscoresState,
    failHighscores,
    resetHighscores,
  ]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div aria-hidden className="ui-game-vignette pointer-events-none absolute inset-0 z-10" />
      {!ownCharacter ? (
        <CharacterSelectScreen
          status={status}
          characters={characters}
          creationOptions={creationOptions}
          busy={characterBusy}
          error={
            serverError
              ? t(`serverErrors.${serverError}`, {
                  defaultValue: t("serverErrors.unknown"),
                })
              : null
          }
          onLogout={onLogout}
          onReconnect={() => reconnect(null)}
          onCreate={(input: CreateCharacterInput) => {
            setServerError(null);
            if (clientRef.current?.createCharacter(input)) {
              setCharacterBusy(true);
              return;
            }
            setServerError("character-list-failed");
          }}
          onSelect={(characterId) => {
            setServerError(null);
            if (clientRef.current?.selectCharacter(characterId)) {
              setCharacterBusy(true);
              return;
            }
            setServerError("character-load-failed");
          }}
        />
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 z-40">
            <TopNavigationBar
              characterName={ownCharacter.name}
              level={ownCharacter.level}
              vocation={t(`vocations.${ownCharacter.vocation}.name`)}
              outfit={ownCharacter.outfit}
              health={ownCharacter.health}
              maxHealth={ownCharacter.maxHealth}
              mana={ownCharacter.mana}
              maxMana={ownCharacter.maxMana}
              connectionStatus={status}
              fightMode={fightState?.mode ?? null}
              battleListVisible={battleListVisible}
              minimapVisible={minimapVisible}
              activePanel={
                marketSession
                  ? "market"
                  : guildModalOpen
                    ? "guild"
                    : houseModalOpen
                      ? "house"
                      : highscoresOpen
                        ? "highscores"
                        : characterStatsOpen
                          ? "character"
                          : inventoryOpen
                            ? "inventory"
                            : undefined
              }
              onCharacter={() => {
                setGameMenuOpen(false);
                if (characterStatsOpen) {
                  setCharacterStatsOpen(false);
                  setInventoryOpen(false);
                  return;
                }
                setInventoryOpen(true);
                setCharacterStatsOpen(true);
              }}
              onInventory={() => {
                setGameMenuOpen(false);
                if (characterStatsOpen) {
                  setCharacterStatsOpen(false);
                  setInventoryOpen(true);
                  return;
                }
                setCharacterStatsOpen(false);
                setInventoryOpen((open) => !open);
              }}
              onGuild={() => {
                setGameMenuOpen(false);
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                setGuildModalOpen((open) => {
                  if (!open) clientRef.current?.openGuild();
                  return !open;
                });
              }}
              onHouse={() => {
                setGameMenuOpen(false);
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                setGuildModalOpen(false);
                setHouseModalOpen((open) => {
                  if (!open) clientRef.current?.openHouse();
                  return !open;
                });
              }}
              onHighscores={() => {
                setGameMenuOpen(false);
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                setHighscoresOpen((open) => {
                  if (!open) {
                    const sent =
                      clientRef.current?.requestHighscores(
                        "experience",
                        undefined,
                        0,
                      ) ?? false;
                    beginHighscores(sent);
                  }
                  return !open;
                });
              }}
              onBattleList={() =>
                setBattleListVisible((visible) => !visible)
              }
              onMinimap={() => setMinimapVisible((visible) => !visible)}
              onFightModeChange={(mode) =>
                clientRef.current?.setFightMode(mode)
              }
              onMarket={() => {
                setGameMenuOpen(false);
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                if (marketSession) {
                  closeMarket();
                  return;
                }
                clientRef.current?.openMarket(1);
              }}
              onSettings={() => {
                setInventoryOpen(false);
                setCharacterStatsOpen(false);
                setGameMenuOpen(true);
              }}
            />
          </div>
          {status === "disconnected" && (
            <button
              type="button"
              role="alert"
              onClick={() => reconnect(ownCharacter.id)}
              className="ui-panel-frame absolute top-24 left-1/2 z-50 -translate-x-1/2 px-4 py-3 font-tibia text-sm text-ui-text-bright"
            >
              {t("connection.disconnected")} · {t("connection.reconnect")}
            </button>
          )}
          {serverError && (
            <button
              type="button"
              role="alert"
              onClick={() => setServerError(null)}
              className="ui-panel-frame absolute top-24 left-1/2 z-50 max-w-md -translate-x-1/2 px-4 py-3 font-tibia text-sm text-red-200"
            >
              {t(`serverErrors.${serverError}`, {
                defaultValue: t("serverErrors.unknown"),
              })}
            </button>
          )}
          {marketToast && (
            <Toast
              message={t(`auction.toast.${marketToast}`)}
              onDismiss={dismissMarketToast}
            />
          )}
          {tradeToast && (
            <Toast
              message={t(`trade.closed.${tradeToast}`)}
              onDismiss={dismissTradeToast}
            />
          )}
          {houseToast && (
            <Toast
              message={t(`house.events.${houseToast.kind}`, {
                house: houseToast.houseName,
                detail: houseToast.detail,
                warningsLeft: houseToast.warningsLeft ?? 0,
              })}
              onDismiss={dismissHouseToast}
            />
          )}
          {guildToast && (
            <Toast
              message={t(`guild.events.${guildToast.kind}`, {
                detail: guildToast.detail,
                defaultValue: t("guild.events.member-joined", {
                  detail: guildToast.detail,
                }),
              })}
              onDismiss={dismissGuildToast}
            />
          )}
          {vipToast && (
            <Toast
              message={t("vip.loggedIn", { name: vipToast })}
              onDismiss={dismissVipToast}
            />
          )}
          {levelUpNotice && (
            <LevelUpBanner
              key={levelUpNotice.id}
              level={levelUpNotice.level}
            />
          )}
          {runeTargeting && (
            <div
              role="status"
              className="ui-panel-frame pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 px-4 py-2 font-tibia text-sm text-ui-text-bright"
            >
              {t("combat.selectRuneTarget")}
            </div>
          )}
          {fightState && (
            <GameHud
              spellHotkeysEnabled={
                !gameMenuOpen &&
                !characterStatsOpen &&
                actionBarConfigSlot === null
              }
              battleListVisible={battleListVisible}
              minimapVisible={minimapVisible}
              mapName={mapName}
              inventoryOpen={inventoryOpen}
              minimapLayout={uiSettings.minimap ?? null}
              onMinimapLayoutChange={handleMinimapLayoutChange}
              visibleCreatures={visibleCreatures}
              ownCharacter={ownCharacter}
              fightState={fightState}
              spells={spells}
              actionBar={actionBar}
              hasWeapon={Boolean(inventory?.equipment.weapon)}
              combatLog={combatLog}
              chatChannels={[
                ...chatState.channels.map((channel) => ({
                  id: channel.id,
                  label:
                    channel.kind === "party"
                      ? t("chat.channels.party")
                      : channel.kind === "guild"
                        ? t("chat.channels.guild")
                        : (channel.counterpart ?? t("chat.channels.local")),
                  kind: channel.kind,
                  canSend: true,
                  closable: channel.kind === "whisper",
                  unreadCount: channel.unreadCount,
                  messages: channel.entries.map((entry) =>
                    toChatMessage(entry, t),
                  ),
                })),
                {
                  id: SYSTEM_CHANNEL_ID,
                  label: t("chat.channels.system"),
                  kind: "system",
                  description: t("chat.systemDescription"),
                  canSend: false,
                  messages: combatLog.map((body, index) => ({
                    id: `combat:${index}:${body}`,
                    body,
                    tone: "combat" as const,
                  })),
                },
              ]}
              chatSelectedChannelId={chatState.activeChannelId}
              onChatChannelSelect={(channelId) =>
                dispatchChat({ type: "select", channelId })
              }
              onChatChannelClose={(channelId) =>
                dispatchChat({ type: "close", channelId })
              }
              onChatSenderSelect={(sender) => {
                if (sender === ownCharacter.name) return;
                dispatchChat({ type: "open-private", counterpart: sender });
              }}
              onSendChat={(channelId, body) => {
                if (channelId === PARTY_CHANNEL_ID) {
                  const text = sanitizeChatText(body);
                  if (text.length > 0) clientRef.current?.sendPartyChat(text);
                  return;
                }
                if (channelId === GUILD_CHANNEL_ID) {
                  const text = sanitizeChatText(body);
                  if (text.length > 0) clientRef.current?.sendGuildChat(text);
                  return;
                }
                if (channelId === LOCAL_CHANNEL_ID) {
                  const sanitized = sanitizeChatText(body);
                  if (sanitized.toLowerCase().startsWith("/p ")) {
                    const partyText = sanitized.slice(3).trim();
                    if (partyText.length > 0) {
                      clientRef.current?.sendPartyChat(partyText);
                    }
                    return;
                  }
                  if (sanitized.toLowerCase().startsWith("/g ")) {
                    const guildText = sanitized.slice(3).trim();
                    if (guildText.length > 0) {
                      clientRef.current?.sendGuildChat(guildText);
                    }
                    return;
                  }
                  if (sanitized.toLowerCase().startsWith("/report")) {
                    const targetName = sanitized.slice(7).trim();
                    setReportSession({
                      targetName,
                      pending: false,
                      error: null,
                      sent: false,
                    });
                    return;
                  }
                  const { mode, text } = parseChatInput(body);
                  if (text.length > 0) clientRef.current?.speak(mode, text);
                  return;
                }
                const channel = chatState.channels.find(
                  (candidate) => candidate.id === channelId,
                );
                if (!channel?.counterpart) return;
                const text = sanitizeChatText(body);
                if (text.length === 0) return;
                clientRef.current?.sendPrivateChat(channel.counterpart, text);
              }}
              onCast={(spellId, target) =>
                clientRef.current?.castSpell(spellId, target)
              }
              onConfigureActionBar={setActionBarConfigSlot}
            />
          )}
          {npcDialogue && (
            <div className="absolute inset-x-4 bottom-24 z-30 flex justify-center">
              <NpcDialogue
                dialogue={npcDialogue}
                onChoice={(choiceId) =>
                  clientRef.current?.sendNpcDialogueChoice(
                    npcDialogue.npcId,
                    npcDialogue.conversationId,
                    choiceId,
                  )
                }
              />
            </div>
          )}
          {bankSession && inventory && (
            <BankPanel
              npcName={bankSession.npcName}
              balance={bankSession.balance}
              carriedGold={inventory.gold}
              carriedPlatinum={inventory.platinum}
              carriedCrystal={inventory.crystal}
              pending={bankSession.pending}
              error={bankSession.error}
              onDeposit={(amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankDeposit(bankSession.npcId, amount);
              }}
              onWithdraw={(amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankWithdraw(bankSession.npcId, amount);
              }}
              onTransfer={(toCharacterName, amount) => {
                setBankSession((current) =>
                  current ? { ...current, pending: true, error: null } : current,
                );
                clientRef.current?.bankTransfer(
                  bankSession.npcId,
                  toCharacterName,
                  amount,
                );
              }}
              onClose={() => setBankSession(null)}
            />
          )}
          {shopSession && inventory && (
            <ShopPanel
              npcName={shopSession.npcName}
              entries={shopSession.entries}
              carriedTotal={
                Math.max(
                  0,
                  (shopSession.currencyItemTypeId === GOLD_COIN_TYPE_ID
                    ? inventory.gold +
                      inventory.platinum * 100 +
                      inventory.crystal * 10_000
                    : shopSession.currencyAmount) -
                    shopSession.pendingPurchaseCost,
                )
              }
              currencyName={shopSession.currencyName}
              currencySpriteId={shopSession.currencySpriteId}
              pending={shopSession.pending}
              error={shopSession.error}
              lastTransaction={shopSession.lastTransaction}
              onBuy={(offerId, amount) => {
                const entry = shopSession.entries.find(
                  (candidate) => candidate.offerId === offerId,
                );
                if (!entry || entry.buyPrice === undefined) return;
                const rejection = precheckShopPurchase({
                  unitWeight: entry.weight,
                  amount,
                  totalCost: entry.buyPrice * amount,
                  currencyItemTypeId: shopSession.currencyItemTypeId,
                  currencyAmount: shopSession.currencyAmount,
                  currencyWeight: shopSession.currencyWeight,
                  coinWeights: shopSession.coinWeights,
                  pendingPurchaseCost: shopSession.pendingPurchaseCost,
                  inventory,
                });
                if (rejection) {
                  setShopSession((current) =>
                    current?.shopSessionId === shopSession.shopSessionId
                      ? { ...current, error: rejection }
                      : current,
                  );
                  return;
                }
                const predicted = previewInventory({
                  kind: "add",
                  item: toInventoryItemPresentation(entry),
                  count: amount,
                  itemIds: Array.from(
                    {
                      length: entry.stackable
                        ? Math.ceil(amount / entry.maxCount)
                        : amount,
                    },
                    () => crypto.randomUUID(),
                  ),
                });
                if (!predicted) {
                  setShopSession((current) =>
                    current?.shopSessionId === shopSession.shopSessionId
                      ? { ...current, error: "busy" }
                      : current,
                  );
                  return;
                }
                const sent =
                  clientRef.current?.shopBuy(
                    shopSession.npcId,
                    shopSession.shopSessionId,
                    offerId,
                    amount,
                  ) ?? false;
                if (!sent) {
                  rejectInventoryPreview();
                }
                setShopSession((current) =>
                  current?.shopSessionId === shopSession.shopSessionId
                    ? {
                        ...current,
                        pending: sent,
                        error: sent ? null : "failed",
                        pendingPurchaseCost: sent
                          ? entry.buyPrice! * amount
                          : 0,
                      }
                    : current,
                );
              }}
              onSell={(offerId, amount) => {
                const entry = shopSession.entries.find(
                  (candidate) => candidate.offerId === offerId,
                );
                if (!entry || entry.sellPrice === undefined) return;
                const rejection = precheckShopSale({
                  unitWeight: entry.weight,
                  amount,
                  totalProceeds: entry.sellPrice * amount,
                  currencyItemTypeId: shopSession.currencyItemTypeId,
                  currencyWeight: shopSession.currencyWeight,
                  coinWeights: shopSession.coinWeights,
                  inventory,
                });
                if (rejection) {
                  setShopSession((current) =>
                    current?.shopSessionId === shopSession.shopSessionId
                      ? { ...current, error: rejection }
                      : current,
                  );
                  return;
                }
                const sent =
                  clientRef.current?.shopSell(
                    shopSession.npcId,
                    shopSession.shopSessionId,
                    offerId,
                    amount,
                  ) ?? false;
                if (!sent) return;
                setShopSession((current) =>
                  current?.shopSessionId === shopSession.shopSessionId
                    ? { ...current, pending: true, error: null }
                    : current,
                );
              }}
              onClose={() => setShopSession(null)}
            />
          )}
          {depotSession && inventory && !marketSession && (
            <DepotModal
              key={depotSession.state.sessionId}
              state={depotSession.state}
              inventoryItems={inventory.items}
              pending={depotSession.pending}
              error={depotSession.error}
              onBrowse={(location, page, query) => {
                const sent =
                  clientRef.current?.browseDepot(
                    depotSession.state,
                    location,
                    page,
                    query,
                  ) ?? false;
                beginDepotBrowse(sent);
              }}
              onDeposit={(item) => {
                if (
                  depotSession.state.depotCount >=
                  depotSession.state.depotCapacity
                ) {
                  rejectDepotAction("depot-full");
                  return;
                }
                enqueueDepotAction({ kind: "deposit", item });
              }}
              onWithdraw={(entry) => {
                if (exceedsCapacity(inventory, entry.weight * entry.count)) {
                  rejectDepotAction("no-capacity");
                  return;
                }
                enqueueDepotAction({ kind: "withdraw", entry });
              }}
              onStashDeposit={(item, count) => {
                enqueueDepotAction({ kind: "stash-deposit", item, count });
              }}
              onStashWithdraw={(entry, count) => {
                if (exceedsCapacity(inventory, entry.weight * count)) {
                  rejectDepotAction("no-capacity");
                  return;
                }
                enqueueDepotAction({ kind: "stash-withdraw", entry, count });
              }}
              onClose={() => {
                clientRef.current?.closeDepot(depotSession.state.sessionId);
                closeDepot();
              }}
            />
          )}
          {marketSession && (
            <AuctionHouseModal
              items={marketSession.items.map(toAuctionHouseItem)}
              offers={
                marketItemOffers
                  ? marketItemOffers.offers.map((offer) =>
                      toAuctionOffer(offer, marketItemOffers.itemTypeId),
                    )
                  : []
              }
              goldBalance={marketSession.balance}
              selectedItemId={marketSelectedItem}
              ownOffers={marketSession.ownOffers.map(toAuctionOwnOffer)}
              history={marketSession.history.map(toAuctionHistoryEntry)}
              error={
                marketSession.error
                  ? t(`auction.errors.${marketSession.error}`, {
                      defaultValue: t("auction.errors.failed"),
                    })
                  : null
              }
              onClose={closeMarket}
              onSelectItem={(itemId) => {
                const itemTypeId = Number(itemId);
                if (!Number.isInteger(itemTypeId)) return;
                marketSelectedItemRef.current = itemTypeId;
                setMarketSelectedItem(itemId);
                clientRef.current?.browseMarket(itemTypeId);
              }}
              onAcceptOffer={
                marketSession.pending
                  ? undefined
                  : (intent) => {
                      const sent =
                        clientRef.current?.acceptMarketOffer(
                          crypto.randomUUID(),
                          intent.offerId,
                          intent.amount,
                        ) ?? false;
                      beginMarketAction(sent);
                    }
              }
              onCreateOrder={
                marketSession.pending
                  ? undefined
                  : (intent) => {
                      const itemTypeId = Number(intent.itemId);
                      if (!Number.isInteger(itemTypeId)) return;
                      const sent =
                        clientRef.current?.createMarketOffer(
                          crypto.randomUUID(),
                          intent.side,
                          itemTypeId,
                          intent.amount,
                          intent.pricePerItem,
                        ) ?? false;
                      beginMarketAction(sent);
                    }
              }
              onCancelOffer={
                marketSession.pending
                  ? undefined
                  : (offerId) => {
                      const sent =
                        clientRef.current?.cancelMarketOffer(
                          crypto.randomUUID(),
                          offerId,
                        ) ?? false;
                      beginMarketAction(sent);
                    }
              }
            />
          )}
          {actionBarConfigSlot !== null && (
            <ActionBarModal
              spells={spells}
              actionBar={actionBar}
              initialSlot={actionBarConfigSlot}
              onChange={handleActionBarChange}
              onClose={() => setActionBarConfigSlot(null)}
            />
          )}
          {guildModalOpen && (
            <GuildModal
              session={guildSession}
              ownPlayerId={ownCharacter.id}
              error={
                guildSession.error
                  ? t(`guild.errors.${guildSession.error}`, {
                      defaultValue: t("guild.errors.invalid-request"),
                    })
                  : null
              }
              onClose={() => setGuildModalOpen(false)}
              onCreate={(name) => clientRef.current?.createGuild(name)}
              onRespondInvitation={(guildId, accept) =>
                clientRef.current?.respondToGuildInvite(guildId, accept)
              }
              onInvite={(targetName) =>
                clientRef.current?.inviteToGuild(targetName)
              }
              onRevokeInvite={(characterId) =>
                clientRef.current?.revokeGuildInvite(characterId)
              }
              onKick={(characterId) =>
                clientRef.current?.kickFromGuild(characterId)
              }
              onPromote={(characterId) =>
                clientRef.current?.promoteGuildMember(characterId)
              }
              onDemote={(characterId) =>
                clientRef.current?.demoteGuildMember(characterId)
              }
              onSetNick={(characterId, nick) =>
                clientRef.current?.setGuildNick(characterId, nick)
              }
              onSetMotd={(motd) => clientRef.current?.setGuildMotd(motd)}
              onSetRankName={(level, name) =>
                clientRef.current?.setGuildRankName(level, name)
              }
              onPassLeadership={(characterId) =>
                clientRef.current?.passGuildLeadership(characterId)
              }
              onDisband={() => clientRef.current?.disbandGuild()}
              onLeave={() => clientRef.current?.leaveGuild()}
              onDeclareWar={(targetGuildName, fragLimit) =>
                clientRef.current?.declareGuildWar(targetGuildName, fragLimit)
              }
              onRespondWar={(warId, accept) =>
                clientRef.current?.respondToGuildWar(warId, accept)
              }
              onEndWar={(warId) => clientRef.current?.endGuildWar(warId)}
            />
          )}
          {houseModalOpen && (
            <HouseModal
              session={houseSession}
              error={
                houseSession.error
                  ? t(`house.errors.${houseSession.error}`, {
                      defaultValue: t("house.errors.invalid-request"),
                    })
                  : null
              }
              onClose={() => setHouseModalOpen(false)}
              onBuy={(houseId) => clientRef.current?.buyHouse(houseId)}
              onAbandon={() => clientRef.current?.abandonHouse()}
              onOfferTransfer={(targetName, price) =>
                clientRef.current?.offerHouseTransfer(targetName, price)
              }
              onRespondOffer={(houseId, accept) => {
                clientRef.current?.respondToHouseTransfer(houseId, accept);
                houseOfferResolved(houseId);
              }}
              onCancelTransfer={() => clientRef.current?.cancelHouseTransfer()}
              onSetAccess={(kind, targetName, grant) =>
                clientRef.current?.setHouseAccess(kind, targetName, grant)
              }
              onKick={(targetCharacterId) =>
                clientRef.current?.kickFromHouse(targetCharacterId)
              }
              onBrowse={(townId, page) =>
                clientRef.current?.browseHouses(townId, page)
              }
              onOpenHouse={(houseId) => clientRef.current?.openHouse(houseId)}
            />
          )}
          {partySession.invitation && (
            <div className="absolute top-40 left-1/2 z-40 -translate-x-1/2">
              <PartyInvitationToast
                leaderName={partySession.invitation.leaderName}
                onAccept={() => {
                  const invitation = partySession.invitation;
                  if (!invitation) return;
                  clientRef.current?.respondToPartyInvite(
                    invitation.leaderId,
                    true,
                  );
                  partyInvitationRevoked(invitation.leaderId);
                }}
                onDecline={() => {
                  const invitation = partySession.invitation;
                  if (!invitation) return;
                  clientRef.current?.respondToPartyInvite(
                    invitation.leaderId,
                    false,
                  );
                  partyInvitationRevoked(invitation.leaderId);
                }}
              />
            </div>
          )}
          {vipPanelVisible && (
            <div
              className={`absolute top-40 z-30 ${
                partyPanelVisible ? "left-72" : "left-4"
              }`}
            >
              <VipPanel
                entries={vipSession.entries}
                error={
                  vipSession.error
                    ? t(`vip.errors.${vipSession.error}`, {
                        defaultValue: t("vip.errors.invalid-request"),
                      })
                    : null
                }
                onAdd={(name) => clientRef.current?.addVip(name)}
                onEdit={(targetCharacterId, edits) =>
                  clientRef.current?.editVip(targetCharacterId, edits)
                }
                onRemove={(targetCharacterId) =>
                  clientRef.current?.removeVip(targetCharacterId)
                }
                onClose={() => setVipPanelVisible(false)}
              />
            </div>
          )}
          {highscoresOpen && (
            <HighscoresModal
              page={highscoresSession.page}
              pending={highscoresSession.pending}
              error={
                highscoresSession.error
                  ? t(`highscores.errors.${highscoresSession.error}`, {
                      defaultValue: t("highscores.errors.unavailable"),
                    })
                  : null
              }
              onRequest={(category, vocation, requestedPage) => {
                const sent =
                  clientRef.current?.requestHighscores(
                    category,
                    vocation,
                    requestedPage,
                  ) ?? false;
                beginHighscores(sent);
              }}
              onClose={() => setHighscoresOpen(false)}
            />
          )}
          {reportSession && (
            <ReportPlayerModal
              key={reportSession.targetName || "report"}
              initialTargetName={reportSession.targetName}
              pending={reportSession.pending}
              error={
                reportSession.error
                  ? t(`report.errors.${reportSession.error}`, {
                      defaultValue: t("report.errors.invalid-request"),
                    })
                  : null
              }
              sent={reportSession.sent}
              onSubmit={(targetName, reason, comment) => {
                const sent =
                  clientRef.current?.reportPlayer(
                    targetName,
                    reason,
                    comment,
                  ) ?? false;
                setReportSession((current) =>
                  current
                    ? {
                        ...current,
                        targetName,
                        pending: sent,
                        error: sent ? null : "invalid-request",
                      }
                    : current,
                );
              }}
              onClose={() => setReportSession(null)}
            />
          )}
          {partyPanelVisible && (
            <div className="absolute top-40 left-4 z-30">
              <PartyPanel
                party={partySession.party}
                ownPlayerId={ownCharacter.id}
                error={
                  partySession.error
                    ? t(`party.errors.${partySession.error}`, {
                        defaultValue: t("party.errors.invalid-target"),
                      })
                    : null
                }
                onInvite={(targetName) =>
                  clientRef.current?.inviteToParty(targetName)
                }
                onRevokeInvite={(targetPlayerId) =>
                  clientRef.current?.revokePartyInvite(targetPlayerId)
                }
                onKick={(targetPlayerId) =>
                  clientRef.current?.kickFromParty(targetPlayerId)
                }
                onPassLeadership={(targetPlayerId) =>
                  clientRef.current?.passPartyLeadership(targetPlayerId)
                }
                onSetSharedExp={(enabled) =>
                  clientRef.current?.setPartySharedExp(enabled)
                }
                onLeave={() => clientRef.current?.leaveParty()}
                onClose={() => setPartyPanelVisible(false)}
              />
            </div>
          )}
          {tradeSession && (
            <TradePanel
              session={tradeSession}
              error={
                tradeSession.error
                  ? t(`trade.errors.${tradeSession.error}`, {
                      defaultValue: t("trade.errors.failed"),
                    })
                  : null
              }
              onAccept={() => {
                const sent = clientRef.current?.acceptTrade() ?? false;
                beginTradeAction(sent);
              }}
              onCancel={() => {
                clientRef.current?.cancelTrade();
              }}
            />
          )}
          {mailboxSession && inventory && (
            <MailboxModal
              key={mailboxSession.sessionId}
              inventoryItems={inventory.items}
              pending={mailboxSession.pending}
              error={mailboxSession.error}
              sentRecipient={mailboxSession.sentRecipient}
              onSend={(item, recipientName) => {
                const sent =
                  clientRef.current?.sendMail(
                    mailboxSession.sessionId,
                    item,
                    recipientName,
                  ) ?? false;
                setMailboxSession((current) =>
                  current?.sessionId === mailboxSession.sessionId
                    ? {
                        ...current,
                        pending: sent,
                        error: sent ? null : "failed",
                        sentRecipient: null,
                      }
                    : current,
                );
              }}
              onClose={() => {
                clientRef.current?.closeMailbox(mailboxSession.sessionId);
                setMailboxSession(null);
              }}
            />
          )}
          {lootSession && (
            <div
              className={`absolute top-24 z-30 ${
                inventoryOpen ? "right-[26rem]" : "right-4"
              }`}
            >
              <LootPanel
                state={lootSession.state}
                onLootItem={(item) =>
                  clientRef.current?.lootItem(
                    item,
                    lootSession.state.container.id,
                  )
                }
                onDragStart={(source) => {
                  itemDragRef.current = source;
                }}
                onDragEnd={() => {
                  itemDragRef.current = null;
                }}
                onClose={(containerId) => {
                  clientRef.current?.closeWorldContainer(containerId);
                  setLootSession((current) =>
                    current?.state.container.id === containerId
                      ? null
                      : current,
                  );
                }}
              />
            </div>
          )}
          {inventoryOpen && inventory && (
            <div
              className={`absolute top-24 right-4 bottom-4 z-30 w-[calc(100vw-2rem)] transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none ${
                characterStatsOpen ? "max-w-3xl" : "max-w-96"
              }`}
            >
              <InventoryPanel
                characterName={ownCharacter.name}
                character={ownCharacter}
                characterStatsOpen={characterStatsOpen}
                {...inventory}
                onClose={() => {
                  setInventoryOpen(false);
                  setCharacterStatsOpen(false);
                }}
                onToggleCharacterStats={() =>
                  setCharacterStatsOpen((open) => !open)
                }
                onEquip={(item) => {
                  if (!item.equipmentSlot) return;
                  dispatchItemOpChecked({
                    kind: "equip",
                    itemId: item.id,
                    slot: item.equipmentSlot,
                  });
                }}
                onUnequip={(item, slot) =>
                  dispatchItemOpChecked({
                    kind: "unequip",
                    itemId: item.id,
                    slot,
                  })
                }
                onUseRune={(item) => {
                  const rune = spells.find(
                    (spell) =>
                      spell.origin === "rune" &&
                      spell.runeItemTypeId === item.typeId,
                  );
                  const target = getRuneCombatTarget(
                    rune,
                    fightState?.attackTargetId ?? null,
                    visibleCreatures,
                    ownCharacter.position,
                  );
                  if (rune?.targetKind === "position") {
                    pendingRuneRef.current = item;
                    setRuneTargeting(true);
                    setInventoryOpen(false);
                    setCharacterStatsOpen(false);
                    return;
                  }
                  clientRef.current?.useRune(item, target);
                }}
                onOpenContainer={(item) =>
                  clientRef.current?.openContainer(item)
                }
                onCloseContainer={(containerId) =>
                  clientRef.current?.closeContainer(containerId)
                }
                onUseItem={(item) => clientRef.current?.useItem(item)}
                onDragStart={(source) => {
                  itemDragRef.current = source;
                }}
                onDragEnd={() => {
                  itemDragRef.current = null;
                }}
                onDropInContainer={(destination, slot) => {
                  const source = itemDragRef.current;
                  if (!source) return;
                  if (
                    source.kind === "owned" &&
                    source.location.kind === "container" &&
                    source.location.containerId === destination.id &&
                    source.location.slot === slot
                  ) {
                    itemDragRef.current = null;
                    return;
                  }
                  if (source.kind === "world") {
                    const queued = dispatchItemOpChecked({
                      kind: "pickup",
                      itemId: source.item.instanceId,
                      revision: source.item.revision,
                      position: source.position,
                      ...(source.item.weight !== undefined
                        ? { weight: source.item.weight * source.item.count }
                        : {}),
                      destination: { containerId: destination.id, slot },
                    });
                    if (queued) {
                      rendererRef.current?.previewMapItemRemoval(
                        source.position,
                        source.item.instanceId,
                      );
                    }
                  } else if (source.kind === "loot") {
                    clientRef.current?.lootItem(
                      source.item,
                      source.containerId,
                      {
                        containerId: destination.id,
                        containerRevision: destination.revision,
                        slot,
                      },
                    );
                  } else if (source.location.kind === "equipment") {
                    dispatchItemOpChecked({
                      kind: "unequip",
                      itemId: source.item.id,
                      slot: source.location.slot,
                      destination: { containerId: destination.id, slot },
                    });
                  } else {
                    dispatchItemOpChecked({
                      kind: "move",
                      itemId: source.item.id,
                      destinationContainerId: destination.id,
                      destinationSlot: slot,
                    });
                  }
                  itemDragRef.current = null;
                }}
                onDropInEquipment={(slot) => {
                  const source = itemDragRef.current;
                  itemDragRef.current = null;
                  if (source?.kind === "world") {
                    const queued = dispatchItemOpChecked({
                      kind: "pickup",
                      itemId: source.item.instanceId,
                      revision: source.item.revision,
                      position: source.position,
                      ...(source.item.weight !== undefined
                        ? { weight: source.item.weight * source.item.count }
                        : {}),
                      equipSlot: slot,
                    });
                    if (queued) {
                      rendererRef.current?.previewMapItemRemoval(
                        source.position,
                        source.item.instanceId,
                      );
                    }
                    return;
                  }
                  if (source?.kind !== "owned") return;
                  if (
                    source.location.kind === "equipment" &&
                    source.location.slot === slot
                  ) {
                    return;
                  }
                  dispatchItemOpChecked({
                    kind: "equip",
                    itemId: source.item.id,
                    slot,
                  });
                }}
              />
            </div>
          )}
          {itemText && (
            <ItemTextModal
              key={`${itemText.itemId}:${itemText.revision}`}
              item={itemText}
              onClose={() => setItemText(null)}
              onSave={(text) => {
                if (
                  clientRef.current?.writeItem(
                    itemText.itemId,
                    itemText.revision,
                    text,
                  )
                ) {
                  setItemText(null);
                }
              }}
            />
          )}
          {gameMenuOpen && (
            <GameMenuModal
              onClose={() => setGameMenuOpen(false)}
              onLogout={onLogout}
              languageSaving={languageSaving}
              languageError={languageError}
              diagonalWalking={diagonalWalking}
              onDiagonalWalkingChange={setDiagonalWalking}
              onChangeLanguage={(nextLanguage) => {
                setLanguage(nextLanguage);
                setLanguageSaving(true);
                setLanguageError(false);
                if (clientRef.current?.updateLanguage(nextLanguage)) return;
                setLanguage(confirmedLanguageRef.current);
                setLanguageSaving(false);
                setLanguageError(true);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
