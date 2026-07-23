import type { SetStateAction } from "react";
import { DEFAULT_AUTO_POTION_SETTINGS } from "@tibia/protocol";
import { createStore } from "zustand/vanilla";
import { chatReducer, initialChatState } from "../../../lib/chat/chatReducer";
import type { GameWindowRuntime } from "../types/GameWindowRuntime";
import type { GameWindowStore } from "../types/GameWindowStore";
import type { GameWindowStoreConfig } from "../types/GameWindowStoreConfig";
import type { GameWindowStoreState } from "../types/GameWindowStoreState";

function resolveStateAction<T>(value: SetStateAction<T>, current: T): T {
  return typeof value === "function"
    ? (value as (previous: T) => T)(current)
    : value;
}

export function createGameWindowStore({
  accessToken,
  initialLanguage,
  onLogout,
}: GameWindowStoreConfig): GameWindowStore {
  const runtime: GameWindowRuntime = {
    containerRef: { current: null },
    clientRef: { current: null },
    rendererRef: { current: null },
    languageRef: { current: initialLanguage },
    confirmedLanguageRef: { current: initialLanguage },
    joinedRef: { current: false },
    confirmedLevelRef: { current: null },
    levelUpSequenceRef: { current: 0 },
    resumeCharacterIdRef: { current: null },
    pendingRuneRef: { current: null },
    pendingPotionRef: { current: null },
    pendingUseWithRef: { current: null },
    itemDragRef: { current: null },
    visibleCreaturesRef: { current: [] },
    uiSettingsRef: { current: {} },
    uiSettingsSaveTimerRef: { current: null },
    actionBarRef: { current: [] },
    actionBarSaveTimerRef: { current: null },
    potionActionBarRef: { current: [] },
    potionActionBarSaveTimerRef: { current: null },
    autoPotionSettingsRef: {
      current: { ...DEFAULT_AUTO_POTION_SETTINGS },
    },
    autoPotionSettingsSaveTimerRef: { current: null },
    marketOpenRef: { current: false },
    marketSelectedItemRef: { current: null },
    hadPartyRef: { current: false },
    hadGuildRef: { current: false },
  };

  return createStore<GameWindowStoreState>()((set, get) => ({
    accessToken,
    onLogout,
    runtime,
    sessions: null,
    sessionActions: null,
    status: "connecting",
    connectionAttempt: 0,
    characters: null,
    accountTier: "free",
    premiumDaysRemaining: 0,
    mantusCoins: 0,
    creationOptions: null,
    ownCharacter: null,
    worldLoading: false,
    worldLoadProgress: null,
    visibleCreatures: [],
    fightState: null,
    spells: [],
    combatLog: [],
    levelUpNotice: null,
    chatState: initialChatState,
    characterBusy: false,
    inventoryOpen: false,
    characterStatsOpen: false,
    battleListVisible: false,
    minimapVisible: true,
    mapName: null,
    uiSettings: {},
    actionBar: [],
    potionActionBar: [],
    autoPotionSettings: { ...DEFAULT_AUTO_POTION_SETTINGS },
    actionBarConfigSlot: null,
    potionActionBarConfigSlot: null,
    marketSelectedItem: null,
    marketToast: null,
    partyPanelVisible: false,
    guildModalOpen: false,
    guildToast: null,
    houseModalOpen: false,
    vipPanelVisible: false,
    vipToast: null,
    highscoresOpen: false,
    wikiOpen: false,
    wheelOpen: false,
    reportSession: null,
    houseToast: null,
    tradeToast: null,
    itemText: null,
    npcDialogue: null,
    npcTravelPending: false,
    bankSession: null,
    shopSession: null,
    storeOpen: false,
    storeSession: null,
    mailboxSession: null,
    lootSession: null,
    gameMenuOpen: false,
    languageSaving: false,
    languageError: false,
    serverError: null,
    runeTargeting: false,
    potionTargeting: false,
    useWithTargeting: false,
    mapContextMenu: null,
    screenMessage: null,
    setConfig: (config) => set(config),
    bindSessions: (sessions, sessionActions) =>
      set({ sessions, sessionActions }),
    setStatus: (value) =>
      set((state) => ({ status: resolveStateAction(value, state.status) })),
    setConnectionAttempt: (value) =>
      set((state) => ({
        connectionAttempt: resolveStateAction(value, state.connectionAttempt),
      })),
    setCharacters: (value) =>
      set((state) => ({
        characters: resolveStateAction(value, state.characters),
      })),
    setAccountTier: (value) =>
      set((state) => ({
        accountTier: resolveStateAction(value, state.accountTier),
      })),
    setPremiumDaysRemaining: (value) =>
      set((state) => ({
        premiumDaysRemaining: resolveStateAction(
          value,
          state.premiumDaysRemaining,
        ),
      })),
    setMantusCoins: (value) =>
      set((state) => ({
        mantusCoins: resolveStateAction(value, state.mantusCoins),
      })),
    setCreationOptions: (value) =>
      set((state) => ({
        creationOptions: resolveStateAction(value, state.creationOptions),
      })),
    setOwnCharacter: (value) =>
      set((state) => ({
        ownCharacter: resolveStateAction(value, state.ownCharacter),
      })),
    setWorldLoading: (value) =>
      set((state) => ({
        worldLoading: resolveStateAction(value, state.worldLoading),
      })),
    setWorldLoadProgress: (value) =>
      set((state) => ({
        worldLoadProgress: resolveStateAction(value, state.worldLoadProgress),
      })),
    setVisibleCreatures: (value) =>
      set((state) => ({
        visibleCreatures: resolveStateAction(value, state.visibleCreatures),
      })),
    setFightState: (value) =>
      set((state) => ({
        fightState: resolveStateAction(value, state.fightState),
      })),
    setSpells: (value) =>
      set((state) => ({ spells: resolveStateAction(value, state.spells) })),
    setCombatLog: (value) =>
      set((state) => ({
        combatLog: resolveStateAction(value, state.combatLog),
      })),
    setLevelUpNotice: (value) =>
      set((state) => ({
        levelUpNotice: resolveStateAction(value, state.levelUpNotice),
      })),
    dispatchChat: (action) =>
      set((state) => ({ chatState: chatReducer(state.chatState, action) })),
    setCharacterBusy: (value) =>
      set((state) => ({
        characterBusy: resolveStateAction(value, state.characterBusy),
      })),
    setInventoryOpen: (value) =>
      set((state) => ({
        inventoryOpen: resolveStateAction(value, state.inventoryOpen),
      })),
    setCharacterStatsOpen: (value) =>
      set((state) => ({
        characterStatsOpen: resolveStateAction(
          value,
          state.characterStatsOpen,
        ),
      })),
    setBattleListVisible: (value) =>
      set((state) => ({
        battleListVisible: resolveStateAction(value, state.battleListVisible),
      })),
    setMinimapVisible: (value) =>
      set((state) => ({
        minimapVisible: resolveStateAction(value, state.minimapVisible),
      })),
    setMapName: (value) =>
      set((state) => ({ mapName: resolveStateAction(value, state.mapName) })),
    setUiSettings: (value) =>
      set((state) => ({
        uiSettings: resolveStateAction(value, state.uiSettings),
      })),
    setActionBar: (value) =>
      set((state) => ({
        actionBar: resolveStateAction(value, state.actionBar),
      })),
    setPotionActionBar: (value) =>
      set((state) => ({
        potionActionBar: resolveStateAction(value, state.potionActionBar),
      })),
    setAutoPotionSettings: (value) =>
      set((state) => ({
        autoPotionSettings: resolveStateAction(
          value,
          state.autoPotionSettings,
        ),
      })),
    setActionBarConfigSlot: (value) =>
      set((state) => ({
        actionBarConfigSlot: resolveStateAction(
          value,
          state.actionBarConfigSlot,
        ),
      })),
    setPotionActionBarConfigSlot: (value) =>
      set((state) => ({
        potionActionBarConfigSlot: resolveStateAction(
          value,
          state.potionActionBarConfigSlot,
        ),
      })),
    setMarketSelectedItem: (value) =>
      set((state) => ({
        marketSelectedItem: resolveStateAction(
          value,
          state.marketSelectedItem,
        ),
      })),
    setMarketToast: (value) =>
      set((state) => ({
        marketToast: resolveStateAction(value, state.marketToast),
      })),
    setPartyPanelVisible: (value) =>
      set((state) => ({
        partyPanelVisible: resolveStateAction(value, state.partyPanelVisible),
      })),
    setGuildModalOpen: (value) =>
      set((state) => ({
        guildModalOpen: resolveStateAction(value, state.guildModalOpen),
      })),
    setGuildToast: (value) =>
      set((state) => ({
        guildToast: resolveStateAction(value, state.guildToast),
      })),
    setHouseModalOpen: (value) =>
      set((state) => ({
        houseModalOpen: resolveStateAction(value, state.houseModalOpen),
      })),
    setVipPanelVisible: (value) =>
      set((state) => ({
        vipPanelVisible: resolveStateAction(value, state.vipPanelVisible),
      })),
    setVipToast: (value) =>
      set((state) => ({
        vipToast: resolveStateAction(value, state.vipToast),
      })),
    setHighscoresOpen: (value) =>
      set((state) => ({
        highscoresOpen: resolveStateAction(value, state.highscoresOpen),
      })),
    setWikiOpen: (value) =>
      set((state) => ({ wikiOpen: resolveStateAction(value, state.wikiOpen) })),
    setWheelOpen: (value) =>
      set((state) => ({
        wheelOpen: resolveStateAction(value, state.wheelOpen),
      })),
    setReportSession: (value) =>
      set((state) => ({
        reportSession: resolveStateAction(value, state.reportSession),
      })),
    setHouseToast: (value) =>
      set((state) => ({
        houseToast: resolveStateAction(value, state.houseToast),
      })),
    setTradeToast: (value) =>
      set((state) => ({
        tradeToast: resolveStateAction(value, state.tradeToast),
      })),
    setItemText: (value) =>
      set((state) => ({ itemText: resolveStateAction(value, state.itemText) })),
    setNpcDialogue: (value) =>
      set((state) => {
        const npcDialogue = resolveStateAction(value, state.npcDialogue);
        return npcDialogue === state.npcDialogue
          ? { npcDialogue }
          : { npcDialogue, npcTravelPending: false };
      }),
    setNpcTravelPending: (value) =>
      set((state) => ({
        npcTravelPending: resolveStateAction(value, state.npcTravelPending),
      })),
    setBankSession: (value) =>
      set((state) => ({
        bankSession: resolveStateAction(value, state.bankSession),
      })),
    setShopSession: (value) =>
      set((state) => ({
        shopSession: resolveStateAction(value, state.shopSession),
      })),
    setStoreOpen: (value) =>
      set((state) => ({
        storeOpen: resolveStateAction(value, state.storeOpen),
      })),
    setStoreSession: (value) =>
      set((state) => ({
        storeSession: resolveStateAction(value, state.storeSession),
      })),
    setMailboxSession: (value) =>
      set((state) => ({
        mailboxSession: resolveStateAction(value, state.mailboxSession),
      })),
    setLootSession: (value) =>
      set((state) => ({
        lootSession: resolveStateAction(value, state.lootSession),
      })),
    setGameMenuOpen: (value) =>
      set((state) => ({
        gameMenuOpen: resolveStateAction(value, state.gameMenuOpen),
      })),
    setLanguageSaving: (value) =>
      set((state) => ({
        languageSaving: resolveStateAction(value, state.languageSaving),
      })),
    setLanguageError: (value) =>
      set((state) => ({
        languageError: resolveStateAction(value, state.languageError),
      })),
    setServerError: (value) =>
      set((state) => ({
        serverError: resolveStateAction(value, state.serverError),
      })),
    setRuneTargeting: (value) =>
      set((state) => ({
        runeTargeting: resolveStateAction(value, state.runeTargeting),
      })),
    setPotionTargeting: (value) =>
      set((state) => ({
        potionTargeting: resolveStateAction(value, state.potionTargeting),
      })),
    setUseWithTargeting: (value) =>
      set((state) => ({
        useWithTargeting: resolveStateAction(value, state.useWithTargeting),
      })),
    setMapContextMenu: (value) =>
      set((state) => ({
        mapContextMenu: resolveStateAction(value, state.mapContextMenu),
      })),
    showScreenMessage: (text, tone) =>
      set((state) => ({
        screenMessage: {
          id: (state.screenMessage?.id ?? 0) + 1,
          text,
          tone,
        },
      })),
    clearScreenMessage: () => set({ screenMessage: null }),
    closeMarket: () => {
      runtime.marketOpenRef.current = false;
      runtime.marketSelectedItemRef.current = null;
      set({ marketSelectedItem: null });
      get().sessionActions?.market.reset();
    },
    reconnect: (characterId) => {
      const actions = get().sessionActions;
      if (!actions) return;
      runtime.resumeCharacterIdRef.current = characterId;
      runtime.joinedRef.current = false;
      actions.inventory.reset(null);
      actions.depot.reset();
      get().closeMarket();
      actions.party.reset();
      runtime.hadPartyRef.current = false;
      actions.guild.reset();
      runtime.hadGuildRef.current = false;
      actions.house.reset();
      actions.vip.reset();
      actions.highscores.reset();
      actions.bestiary.reset();
      actions.bosstiary.reset();
      actions.wheel.reset();
      actions.gems.reset();
      runtime.actionBarRef.current = [];
      runtime.potionActionBarRef.current = [];
      runtime.autoPotionSettingsRef.current = {
        ...DEFAULT_AUTO_POTION_SETTINGS,
      };
      if (runtime.autoPotionSettingsSaveTimerRef.current) {
        clearTimeout(runtime.autoPotionSettingsSaveTimerRef.current);
        runtime.autoPotionSettingsSaveTimerRef.current = null;
      }
      runtime.pendingRuneRef.current = null;
      runtime.pendingPotionRef.current = null;
      runtime.pendingUseWithRef.current = null;
      runtime.itemDragRef.current = null;
      set((state) => ({
        status: "connecting",
        characters: null,
        creationOptions: null,
        ownCharacter: null,
        itemText: null,
        npcDialogue: null,
        npcTravelPending: false,
        bankSession: null,
        shopSession: null,
        storeOpen: false,
        storeSession: null,
        partyPanelVisible: false,
        guildModalOpen: false,
        guildToast: null,
        houseModalOpen: false,
        houseToast: null,
        vipPanelVisible: false,
        vipToast: null,
        highscoresOpen: false,
        wikiOpen: false,
        wheelOpen: false,
        reportSession: null,
        mailboxSession: null,
        visibleCreatures: [],
        fightState: null,
        spells: [],
        actionBar: [],
        actionBarConfigSlot: null,
        potionActionBar: [],
        autoPotionSettings: { ...DEFAULT_AUTO_POTION_SETTINGS },
        potionActionBarConfigSlot: null,
        combatLog: [],
        chatState: chatReducer(state.chatState, {
          type: "reset",
          ownPlayerId: null,
          ownName: null,
        }),
        characterBusy: characterId !== null,
        inventoryOpen: false,
        characterStatsOpen: false,
        gameMenuOpen: false,
        runeTargeting: false,
        potionTargeting: false,
        useWithTargeting: false,
        mapContextMenu: null,
        screenMessage: null,
        serverError: null,
        connectionAttempt: state.connectionAttempt + 1,
      }));
    },
  }));
}
