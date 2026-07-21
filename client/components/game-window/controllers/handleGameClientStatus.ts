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
    runtime.actionBarRef.current = [];
    runtime.potionActionBarRef.current = [];
    state.setWorldLoading(false);
    state.setLevelUpNotice(null);
    state.setVisibleCreatures([]);
    state.setFightState(null);
    state.setSpells([]);
    state.setRuneTargeting(false);
    state.setPotionTargeting(false);
    state.setActionBar([]);
    state.setActionBarConfigSlot(null);
    state.setPotionActionBar([]);
    state.setPotionActionBarConfigSlot(null);
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
