import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_HUNTING_BOT_ROUTE,
} from "@tibia/protocol";
import type { ConnectionStatus } from "../../../lib/net/GameClient";
import type { GameWindowStore } from "../types/GameWindowStore";

export function handleGameClientStatus(
  nextStatus: ConnectionStatus,
  store: GameWindowStore,
): void {
  const state = store.getState();
  const actions = state.sessionActions;
  const { runtime } = state;

  if (nextStatus === "disconnected") {
    runtime.joinedRef.current = false;
    runtime.confirmedLevelRef.current = null;
    runtime.pendingRuneRef.current = null;
    runtime.pendingPotionRef.current = null;
    runtime.pendingUseWithRef.current = null;
    runtime.pendingActionBarRef.current = null;
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
    runtime.huntingBotRouteRef.current = {
      ...DEFAULT_HUNTING_BOT_ROUTE,
      waypoints: [],
    };
    if (runtime.huntingBotSaveTimerRef.current) {
      clearTimeout(runtime.huntingBotSaveTimerRef.current);
      runtime.huntingBotSaveTimerRef.current = null;
    }
    state.setWorldLoading(false);
    state.setLoginQueue(null);
    state.setLevelUpNotice(null);
    state.setPortableSellerNotice(null);
    state.setVisibleCreatures([]);
    state.setFightState(null);
    state.setSpells([]);
    state.setRuneTargeting(false);
    state.setPotionTargeting(false);
    state.setUseWithTargeting(false);
    state.setMapContextMenu(null);
    state.clearScreenMessage();
    state.setActionBar(createDefaultActionBar());
    state.setActionBotSettings({
      ...DEFAULT_ACTION_BOT_SETTINGS,
      rules: [],
    });
    state.setActionBarEditorRequest(null);
    state.setHuntingBotRoute({ ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] });
    state.setHuntingBotOpen(false);
    state.setHuntingBotStatus(null);
    state.setHuntingBotError(null);
    state.setCombatLog([]);
    state.setItemText(null);
    state.setNpcDialogue(null);
    actions?.depot.reset();
    state.closeMarket();
    actions?.party.reset();
    runtime.hadPartyRef.current = false;
    actions?.guild.reset();
    runtime.hadGuildRef.current = false;
    state.setGuildModalOpen(false);
    state.setGuildToast(null);
    actions?.house.reset();
    state.setHouseModalOpen(false);
    state.setHouseToast(null);
    actions?.vip.reset();
    state.setVipPanelVisible(false);
    state.setVipToast(null);
    actions?.highscores.reset();
    state.setHighscoresOpen(false);
    actions?.bestiary.reset();
    actions?.bosstiary.reset();
    state.setWikiOpen(false);
    state.setReportSession(null);
    state.setMailboxSession(null);
    actions?.inventory.clearPreviews();
    state.dispatchChat({ type: "reset", ownPlayerId: null, ownName: null });
  }

  state.setStatus(nextStatus);
}
