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

  if (message.type !== "welcome") return false;

  runtime.joinedRef.current = true;
  state.setWorldLoading(true);
  state.setWorldLoadProgress(null);
  state.setAccountTier(message.accountTier);
  state.setPremiumDaysRemaining(message.premiumDaysRemaining);
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
  state.setActionBarConfigSlot(null);
  state.setPotionActionBar(message.potionActionBar);
  runtime.potionActionBarRef.current = message.potionActionBar;
  state.setPotionActionBarConfigSlot(null);
  state.setCharacterBusy(false);
  state.setServerError(null);
  state.setNpcDialogue(null);
  state.setBankSession(null);
  state.setShopSession(null);
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
  state.setLootSession(null);
  state.dispatchChat({
    type: "reset",
    ownPlayerId: message.playerId,
    ownName: message.character.name,
  });

  return false;
}
