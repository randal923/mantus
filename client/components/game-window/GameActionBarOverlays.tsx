import { ActionBarModal } from "../action-bar/ActionBarModal";
import { removeInvalidActionBotRules } from "../../lib/action-bar/removeInvalidActionBotRules";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameActionBarOverlays() {
  const store = useGameWindowStoreApi();
  const spells = useGameWindowStore((state) => state.spells);
  const actionBar = useGameWindowStore((state) => state.actionBar);
  const actionBotSettings = useGameWindowStore(
    (state) => state.actionBotSettings,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const request = useGameWindowStore(
    (state) => state.actionBarEditorRequest,
  );
  const setActionBar = useGameWindowStore((state) => state.setActionBar);
  const setActionBotSettings = useGameWindowStore(
    (state) => state.setActionBotSettings,
  );
  const setActionBarEditorRequest = useGameWindowStore(
    (state) => state.setActionBarEditorRequest,
  );

  if (!request) return null;
  return (
    <ActionBarModal
      spells={spells}
      inventory={inventory}
      actionBar={actionBar}
      botSettings={actionBotSettings}
      request={request}
      onActionBarChange={(next) => {
        const runtime = store.getState().runtime;
        const nextBotSettings = removeInvalidActionBotRules(
          runtime.actionBotSettingsRef.current,
          next,
        );
        setActionBar(next);
        setActionBotSettings(nextBotSettings);
        runtime.actionBarRef.current = next;
        runtime.actionBotSettingsRef.current = nextBotSettings;
        if (runtime.actionBarSaveTimerRef.current) {
          clearTimeout(runtime.actionBarSaveTimerRef.current);
        }
        runtime.actionBarSaveTimerRef.current = setTimeout(() => {
          runtime.actionBarSaveTimerRef.current = null;
          runtime.clientRef.current?.updateActionBar(
            runtime.actionBarRef.current,
            runtime.actionBotSettingsRef.current,
          );
        }, 800);
      }}
      onBotSettingsChange={(next) => {
        const runtime = store.getState().runtime;
        setActionBotSettings(next);
        runtime.actionBotSettingsRef.current = next;
        if (runtime.actionBarSaveTimerRef.current) {
          clearTimeout(runtime.actionBarSaveTimerRef.current);
        }
        runtime.actionBarSaveTimerRef.current = setTimeout(() => {
          runtime.actionBarSaveTimerRef.current = null;
          runtime.clientRef.current?.updateActionBar(
            runtime.actionBarRef.current,
            runtime.actionBotSettingsRef.current,
          );
        }, 800);
      }}
      onClose={() => setActionBarEditorRequest(null)}
    />
  );
}
