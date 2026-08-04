import type { ServerMessage } from "@tibia/protocol";
import { anchorFightStateCooldowns } from "../../../lib/combat/anchorFightStateCooldowns";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handleCharacterSessionMessage(
  message: ServerMessage,
  { client, store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();
  const actions = state.sessionActions;
  if (!actions) return false;

  const { runtime } = state;

  if (message.type === "character-list") {
    state.setAccountTier(message.accountTier);
    state.setPremiumDaysRemaining(message.premiumDaysRemaining);
    state.setCharacters(message.characters);
    state.setCreationOptions(message.creationOptions);
    state.setServerError(null);
    const resumeCharacterId = runtime.resumeCharacterIdRef.current;
    if (resumeCharacterId) {
      const canResume = message.characters.some(
        (character) => character.id === resumeCharacterId,
      );
      if (canResume && client.selectCharacter(resumeCharacterId)) {
        state.setCharacterBusy(true);
        return true;
      }
      runtime.resumeCharacterIdRef.current = null;
      state.setServerError("character-load-failed");
    }
    state.setCharacterBusy(false);
    return true;
  }

  // Settings are account-wide: a second live session on this account gets the
  // same ack, so both clients converge without relogging (Feature 69).
  if (message.type === "ui-settings-updated") {
    state.setUiSettings(message.settings);
    runtime.uiSettingsRef.current = message.settings;
    return true;
  }

  // Own-character state: only the requester's entitlements ever arrive here.
  if (message.type === "outfit-state") {
    actions.outfit.stateReceived(message);
    return true;
  }

  if (message.type === "outfit-action-failed") {
    actions.outfit.fail(message.reason);
    return true;
  }

  // Pushed when this session uses a podium; lists only its own unlocks.
  if (message.type === "podium-window") {
    state.setPodiumWindow(message);
    return true;
  }

  if (message.type === "podium-action-failed") {
    state.setPodiumError(message.reason);
    return true;
  }

  // Pushed after opening a reward chest or collecting from it.
  if (message.type === "reward-chest-state") {
    state.setRewardChest(message);
    return true;
  }

  if (message.type === "reward-action-failed") {
    state.setRewardError(message.reason);
    return true;
  }

  // Pushed after using a reward shrine or claiming the daily reward.
  if (message.type === "daily-rewards-state") {
    state.setDailyRewards(message);
    return true;
  }

  if (message.type === "daily-reward-history") {
    state.setDailyHistory(message.entries);
    return true;
  }

  if (message.type === "daily-action-failed") {
    state.setDailyError(message.reason);
    return true;
  }

  // Server-evaluated quest projections; requested when the log opens.
  if (message.type === "quest-log") {
    state.setQuestLog(message);
    return true;
  }

  if (message.type === "quest-line") {
    state.setQuestLine(message);
    return true;
  }

  if (message.type === "quest-log-failed") {
    state.setQuestLogError(message.reason);
    return true;
  }

  if (message.type === "profile-state") {
    actions.profile.stateReceived(message);
    return true;
  }

  // At most once per achievement; the server never re-grants.
  if (message.type === "achievement-granted") {
    state.setAchievementToast({
      name: message.name,
      points: message.points,
    });
    return true;
  }

  if (message.type === "profile-action-failed") {
    actions.profile.fail(message.reason);
    return true;
  }

  if (message.type !== "welcome") return false;

  runtime.joinedRef.current = true;
  runtime.clientRef.current?.requestChannelList();
  state.setWorldLoading(true);
  state.setWorldLoadProgress(null);
  state.setAccountTier(message.accountTier);
  state.setPremiumDaysRemaining(message.premiumDaysRemaining);
  state.setMantusCoins(message.mantusCoins);
  state.setBankBalance(message.bankBalance);
  runtime.confirmedLevelRef.current = {
    playerId: message.playerId,
    level: message.character.level,
  };
  state.setLevelUpNotice(null);
  runtime.resumeCharacterIdRef.current = null;
  state.setOwnCharacter(message.character);
  state.setMapName(message.map.name);
  state.setUiSettings(message.uiSettings);
  runtime.uiSettingsRef.current = message.uiSettings;
  actions.inventory.reset(message.inventory);
  state.setFightState(
    anchorFightStateCooldowns(message.fightState, Date.now()),
  );
  state.setSpells(message.spells);
  state.setActionBar(message.actionBar);
  runtime.actionBarRef.current = message.actionBar;
  state.setActionBotSettings(message.actionBotSettings);
  runtime.actionBotSettingsRef.current = message.actionBotSettings;
  state.setLootFilter(message.lootFilter);
  runtime.lootFilterRef.current = message.lootFilter;
  state.setLootFilterOpen(false);
  state.setLootFilterItems({ carried: [], ignored: [] });
  state.setHuntingBotRoute(message.huntingBotRoute);
  runtime.huntingBotRouteRef.current = message.huntingBotRoute;
  state.setHuntingBotOpen(false);
  // The bot never survives a login, so the window starts from a clean slate.
  state.setHuntingBotStatus(null);
  state.setHuntingBotError(null);
  state.setActionBarEditorRequest(null);
  state.setCharacterBusy(false);
  state.setServerError(null);
  state.setNpcDialogue(null);
  state.setBankSession(null);
  state.setShopSession(null);
  state.setStoreOpen(false);
  state.setStoreSession(null);
  actions.depot.reset();
  state.closeMarket();
  actions.trade.reset();
  actions.party.reset();
  runtime.hadPartyRef.current = false;
  state.setPartyPanelVisible(false);
  actions.guild.reset();
  runtime.hadGuildRef.current = false;
  state.setGuildModalOpen(false);
  state.setGuildToast(null);
  actions.house.reset();
  state.setHouseModalOpen(false);
  state.setHuntFinderOpen(false);
  state.setTrackedHuntRoute(null);
  state.setHouseToast(null);
  actions.vip.reset();
  state.setVipPanelVisible(false);
  state.setVipToast(null);
  actions.highscores.reset();
  state.setHighscoresOpen(false);
  actions.bestiary.reset();
  actions.bosstiary.reset();
  state.setWikiOpen(false);
  actions.wheel.reset();
  actions.gems.reset();
  state.setWheelOpen(false);
  actions.boosted.reset();
  actions.tracker.reset();
  actions.bossSlots.reset();
  actions.forge.reset();
  state.setForgeOpen(false);
  actions.imbuement.reset();
  state.setImbuementItemId(null);
  actions.proficiency.reset();
  actions.animus.reset();
  state.setProficiencyOpen(false);
  actions.cyclopedia.reset();
  actions.prey.reset();
  state.setPreyWindowOpen(false);
  actions.huntingTasks.reset();
  state.setHuntingTasksOpen(false);
  actions.outfit.reset();
  state.setOutfitWindowOpen(false);
  actions.profile.reset();
  state.setProfileWindowOpen(false);
  state.setPublicProfileOpen(false);
  state.setBugReportOpen(false);
  state.setAchievementToast(null);

  window.setTimeout(
    () => runtime.clientRef.current?.browseHouses(undefined, 0),
    50,
  );
  window.setTimeout(
    () => runtime.clientRef.current?.requestBestiaryCreatures(),
    100,
  );
  window.setTimeout(
    () => runtime.clientRef.current?.requestBosstiary(),
    600,
  );
  window.setTimeout(() => runtime.clientRef.current?.requestWheel(), 900);
  state.setReportSession(null);
  state.setMailboxSession(null);
  state.setLootSessions([]);
  state.dispatchChat({
    type: "reset",
    ownPlayerId: message.playerId,
    ownName: message.character.name,
  });

  return false;
}
