import type { SetStateAction } from "react";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_HUNTING_BOT_ROUTE,
  DEFAULT_LOOT_FILTER,
} from "@tibia/protocol";
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

/** Keeps the system log bounded; the newest lines win. */
const COMBAT_LOG_LIMIT = 200;

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
    pendingActionBarRef: { current: null },
    itemDragRef: { current: null },
    visibleCreaturesRef: { current: [] },
    uiSettingsRef: { current: {} },
    uiSettingsSaveTimerRef: { current: null },
    actionBarRef: { current: createDefaultActionBar() },
    actionBarSaveTimerRef: { current: null },
    actionBotSettingsRef: {
      current: { ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] },
    },
    actionBotSaveTimerRef: { current: null },
    lootFilterRef: {
      current: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
    },
    lootFilterSaveTimerRef: { current: null },
    huntingBotRouteRef: {
      current: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
    },
    huntingBotSaveTimerRef: { current: null },
    marketOpenRef: { current: false },
    marketSelectedItemRef: { current: null },
    hadPartyRef: { current: false },
    hadGuildRef: { current: false },
  };

  return createStore<GameWindowStoreState>()((rawSet, get) => {
    // Server messages funnel into these setters at combat rates; a no-op set
    // would still rebuild the root state and re-run every mounted selector.
    const set = (
      partial:
        | Partial<GameWindowStoreState>
        | ((state: GameWindowStoreState) => Partial<GameWindowStoreState>),
    ): void => {
      const state = get();
      const resolved = typeof partial === "function" ? partial(state) : partial;
      for (const key in resolved) {
        const stateKey = key as keyof GameWindowStoreState;
        if (!Object.is(resolved[stateKey], state[stateKey])) {
          rawSet(resolved);
          return;
        }
      }
    };
    return {
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
      bankBalance: 0,
      creationOptions: null,
      ownCharacter: null,
      latencyMs: null,
      worldLoading: false,
      worldLoadProgress: null,
      visibleCreatures: [],
      fightState: null,
      followTargetId: null,
      combatAnalyzer: null,
      spells: [],
      combatLog: [],
      chatChannels: [],
      ignoredNames: [],
      mapMarkers: [],
      levelUpNotice: null,
      chatState: initialChatState,
      chatFocusRequestId: 0,
      characterBusy: false,
      inventoryOpen: false,
      characterStatsOpen: false,
      battleListVisible: false,
      minimapVisible: true,
      mapName: null,
      uiSettings: {},
      actionBar: createDefaultActionBar(),
      actionBotSettings: { ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] },
      lootFilter: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
      lootFilterOpen: false,
      lootFilterItems: { carried: [], types: [] },
      huntingBotOpen: false,
      huntingBotRoute: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
      huntingBotStatus: null,
      huntingBotError: null,
      actionBarEditorRequest: null,
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
      forgeOpen: false,
      proficiencyOpen: false,
      imbuementOpen: false,
      imbuementItemId: null,
      trackerVisible: false,
      imbuementTrackerVisible: false,
      preyWindowOpen: false,
      huntingTasksOpen: false,
      huntFinderOpen: false,
      trackedHuntRoute: null,
      outfitWindowOpen: false,
      podiumWindow: null,
      podiumError: null,
      rewardChest: null,
      rewardError: null,
      rewardChestOpenedAtMs: 0,
      dailyRewards: null,
      dailyError: null,
      dailyHistory: undefined,
      questLogOpen: false,
      questLog: null,
      questLine: null,
      questLogError: null,
      profileWindowOpen: false,
      publicProfileOpen: false,
      bugReportOpen: false,
      achievementToast: null,
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
      lootSessions: [],
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
      setBankBalance: (value) =>
        set((state) => ({
          bankBalance: resolveStateAction(value, state.bankBalance),
        })),
      setCreationOptions: (value) =>
        set((state) => ({
          creationOptions: resolveStateAction(value, state.creationOptions),
        })),
      setOwnCharacter: (value) =>
        set((state) => ({
          ownCharacter: resolveStateAction(value, state.ownCharacter),
        })),
      setLatencyMs: (value) =>
        set((state) => ({
          latencyMs: resolveStateAction(value, state.latencyMs),
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
      setFollowTargetId: (value) =>
        set((state) => ({
          followTargetId: resolveStateAction(value, state.followTargetId),
        })),
      setCombatAnalyzer: (value) =>
        set((state) => ({
          combatAnalyzer: resolveStateAction(value, state.combatAnalyzer),
        })),
      setSpells: (value) =>
        set((state) => ({ spells: resolveStateAction(value, state.spells) })),
      setCombatLog: (value) =>
        set((state) => ({
          combatLog: resolveStateAction(value, state.combatLog),
        })),
      setChatChannels: (value) => set(() => ({ chatChannels: [...value] })),
      setIgnoredNames: (value) => set(() => ({ ignoredNames: [...value] })),
      setMapMarkers: (value) => set(() => ({ mapMarkers: [...value] })),
      appendCombatLog: (text) =>
        set((state) => ({
          combatLog: [...state.combatLog, text].slice(-COMBAT_LOG_LIMIT),
        })),
      setLevelUpNotice: (value) =>
        set((state) => ({
          levelUpNotice: resolveStateAction(value, state.levelUpNotice),
        })),
      dispatchChat: (action) =>
        set((state) => ({ chatState: chatReducer(state.chatState, action) })),
      requestChatFocus: () =>
        set((state) => ({
          chatFocusRequestId: state.chatFocusRequestId + 1,
        })),
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
      setActionBotSettings: (value) =>
        set((state) => ({
          actionBotSettings: resolveStateAction(value, state.actionBotSettings),
        })),
      setLootFilter: (value) =>
        set((state) => ({
          lootFilter: resolveStateAction(value, state.lootFilter),
        })),
      setLootFilterOpen: (value) =>
        set((state) => ({
          lootFilterOpen: resolveStateAction(value, state.lootFilterOpen),
        })),
      setLootFilterItems: (value) => set({ lootFilterItems: value }),
      setHuntingBotOpen: (value) =>
        set((state) => ({
          huntingBotOpen: resolveStateAction(value, state.huntingBotOpen),
        })),
      setHuntingBotRoute: (value) =>
        set((state) => ({
          huntingBotRoute: resolveStateAction(value, state.huntingBotRoute),
        })),
      setHuntingBotStatus: (value) => set({ huntingBotStatus: value }),
      setHuntingBotError: (value) => set({ huntingBotError: value }),
      setActionBarEditorRequest: (value) =>
        set((state) => ({
          actionBarEditorRequest: resolveStateAction(
            value,
            state.actionBarEditorRequest,
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
        set((state) => ({
          wikiOpen: resolveStateAction(value, state.wikiOpen),
        })),
      setWheelOpen: (value) =>
        set((state) => ({
          wheelOpen: resolveStateAction(value, state.wheelOpen),
        })),
      setForgeOpen: (value) =>
        set((state) => ({
          forgeOpen: resolveStateAction(value, state.forgeOpen),
        })),
      setProficiencyOpen: (value) =>
        set((state) => ({
          proficiencyOpen: resolveStateAction(value, state.proficiencyOpen),
        })),
      setImbuementOpen: (value) =>
        set((state) => ({
          imbuementOpen: resolveStateAction(value, state.imbuementOpen),
        })),
      setImbuementItemId: (value) =>
        set((state) => ({
          imbuementItemId: resolveStateAction(value, state.imbuementItemId),
        })),
      setTrackerVisible: (value) =>
        set((state) => ({
          trackerVisible: resolveStateAction(value, state.trackerVisible),
        })),
      setImbuementTrackerVisible: (value) =>
        set((state) => ({
          imbuementTrackerVisible: resolveStateAction(
            value,
            state.imbuementTrackerVisible,
          ),
        })),
      setPreyWindowOpen: (value) =>
        set((state) => ({
          preyWindowOpen: resolveStateAction(value, state.preyWindowOpen),
        })),
      setHuntingTasksOpen: (value) =>
        set((state) => ({
          huntingTasksOpen: resolveStateAction(value, state.huntingTasksOpen),
        })),
      setHuntFinderOpen: (value) =>
        set((state) => ({
          huntFinderOpen: resolveStateAction(value, state.huntFinderOpen),
        })),
      setTrackedHuntRoute: (value) =>
        set((state) => ({
          trackedHuntRoute: resolveStateAction(value, state.trackedHuntRoute),
        })),
      setOutfitWindowOpen: (value) =>
        set((state) => ({
          outfitWindowOpen: resolveStateAction(value, state.outfitWindowOpen),
        })),
      setPodiumWindow: (value) =>
        set(() => ({ podiumWindow: value, podiumError: null })),
      setPodiumError: (value) => set(() => ({ podiumError: value })),
      setRewardChest: (value) =>
        set(() => ({
          rewardChest: value,
          rewardError: null,
          rewardChestOpenedAtMs: Date.now(),
        })),
      setRewardError: (value) => set(() => ({ rewardError: value })),
      // A fresh shrine use drops the history with the old state, so reopening
      // the window fetches it again rather than showing a stale list.
      setDailyRewards: (value) =>
        set(() => ({
          dailyRewards: value,
          dailyError: null,
          dailyHistory: undefined,
        })),
      setDailyError: (value) => set(() => ({ dailyError: value })),
      setDailyHistory: (value) => set(() => ({ dailyHistory: value })),
      setQuestLogOpen: (value) =>
        set((state) => ({
          questLogOpen: resolveStateAction(value, state.questLogOpen),
        })),
      setQuestLog: (value) =>
        set(() => ({ questLog: value, questLogError: null })),
      setQuestLine: (value) => set(() => ({ questLine: value })),
      setQuestLogError: (value) => set(() => ({ questLogError: value })),
      setProfileWindowOpen: (value) =>
        set((state) => ({
          profileWindowOpen: resolveStateAction(value, state.profileWindowOpen),
        })),
      setPublicProfileOpen: (value) =>
        set((state) => ({
          publicProfileOpen: resolveStateAction(value, state.publicProfileOpen),
        })),
      setBugReportOpen: (value) =>
        set((state) => ({
          bugReportOpen: resolveStateAction(value, state.bugReportOpen),
        })),
      setAchievementToast: (value) =>
        set((state) => ({
          achievementToast: resolveStateAction(value, state.achievementToast),
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
        set((state) => ({
          itemText: resolveStateAction(value, state.itemText),
        })),
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
      setLootSessions: (value) =>
        set((state) => ({
          lootSessions: resolveStateAction(value, state.lootSessions),
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
        actions.prey.reset();
        actions.huntingTasks.reset();
        actions.boosted.reset();
        actions.tracker.reset();
        actions.bossSlots.reset();
        actions.forge.reset();
        actions.imbuement.reset();
        runtime.actionBarRef.current = createDefaultActionBar();
        runtime.actionBotSettingsRef.current = {
          ...DEFAULT_ACTION_BOT_SETTINGS,
          rules: [],
        };
        if (runtime.actionBarSaveTimerRef.current) {
          clearTimeout(runtime.actionBarSaveTimerRef.current);
          runtime.actionBarSaveTimerRef.current = null;
        }
        if (runtime.actionBotSaveTimerRef.current) {
          clearTimeout(runtime.actionBotSaveTimerRef.current);
          runtime.actionBotSaveTimerRef.current = null;
        }
        runtime.lootFilterRef.current = {
          ...DEFAULT_LOOT_FILTER,
          pickupRules: [],
        };
        if (runtime.lootFilterSaveTimerRef.current) {
          clearTimeout(runtime.lootFilterSaveTimerRef.current);
          runtime.lootFilterSaveTimerRef.current = null;
        }
        runtime.huntingBotRouteRef.current = {
          ...DEFAULT_HUNTING_BOT_ROUTE,
          waypoints: [],
        };
        if (runtime.huntingBotSaveTimerRef.current) {
          clearTimeout(runtime.huntingBotSaveTimerRef.current);
          runtime.huntingBotSaveTimerRef.current = null;
        }
        runtime.pendingRuneRef.current = null;
        runtime.pendingPotionRef.current = null;
        runtime.pendingUseWithRef.current = null;
        runtime.pendingActionBarRef.current = null;
        runtime.itemDragRef.current = null;
        set((state) => ({
          status: "connecting",
          characters: null,
          creationOptions: null,
          ownCharacter: null,
          latencyMs: null,
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
          forgeOpen: false,
          proficiencyOpen: false,
          imbuementOpen: false,
          imbuementItemId: null,
          preyWindowOpen: false,
          huntingTasksOpen: false,
          outfitWindowOpen: false,
          podiumWindow: null,
          podiumError: null,
          rewardChest: null,
          rewardError: null,
          rewardChestOpenedAtMs: 0,
          dailyRewards: null,
          dailyError: null,
          dailyHistory: undefined,
          questLogOpen: false,
          questLog: null,
          questLine: null,
          questLogError: null,
          profileWindowOpen: false,
          publicProfileOpen: false,
          bugReportOpen: false,
          achievementToast: null,
          reportSession: null,
          mailboxSession: null,
          visibleCreatures: [],
          fightState: null,
          followTargetId: null,
          combatAnalyzer: null,
          spells: [],
          actionBar: createDefaultActionBar(),
          actionBotSettings: {
            ...DEFAULT_ACTION_BOT_SETTINGS,
            rules: [],
          },
          lootFilter: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
          lootFilterOpen: false,
          lootFilterItems: { carried: [], types: [] },
          huntingBotOpen: false,
          huntingBotRoute: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
          huntingBotStatus: null,
          huntingBotError: null,
          actionBarEditorRequest: null,
          combatLog: [],
          chatChannels: [],
          ignoredNames: [],
          mapMarkers: [],
          chatState: chatReducer(state.chatState, {
            type: "reset",
            ownPlayerId: null,
            ownName: null,
          }),
          chatFocusRequestId: 0,
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
    };
  });
}
