import type { GameWindowRuntime } from "../../components/game-window/types/GameWindowRuntime";

/**
 * Sends any debounced action-bar, action-bot, hunting-route or UI-settings
 * save immediately.
 * Edits made inside the 800 ms debounce window are otherwise lost when the tab
 * closes or the session tears down before the timer fires.
 */
export function flushPendingSaves(runtime: GameWindowRuntime): void {
  if (runtime.actionBarSaveTimerRef.current) {
    clearTimeout(runtime.actionBarSaveTimerRef.current);
    runtime.actionBarSaveTimerRef.current = null;
    runtime.clientRef.current?.updateActionBar(runtime.actionBarRef.current);
  }
  if (runtime.actionBotSaveTimerRef.current) {
    clearTimeout(runtime.actionBotSaveTimerRef.current);
    runtime.actionBotSaveTimerRef.current = null;
    runtime.clientRef.current?.updateActionBot(
      runtime.actionBotSettingsRef.current,
    );
  }
  if (runtime.huntingBotSaveTimerRef.current) {
    clearTimeout(runtime.huntingBotSaveTimerRef.current);
    runtime.huntingBotSaveTimerRef.current = null;
    runtime.clientRef.current?.updateHuntingBotRoute(
      runtime.huntingBotRouteRef.current,
    );
  }
  if (runtime.uiSettingsSaveTimerRef.current) {
    clearTimeout(runtime.uiSettingsSaveTimerRef.current);
    runtime.uiSettingsSaveTimerRef.current = null;
    runtime.clientRef.current?.updateUiSettings(runtime.uiSettingsRef.current);
  }
}
