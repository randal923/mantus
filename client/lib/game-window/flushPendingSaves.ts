import type { GameWindowRuntime } from "../../components/game-window/types/GameWindowRuntime";

/**
 * Sends any debounced action-bar / UI-settings save immediately. Edits made
 * inside the 800 ms debounce window are otherwise lost when the tab closes or
 * the session tears down before the timer fires.
 */
export function flushPendingSaves(runtime: GameWindowRuntime): void {
  if (runtime.actionBarSaveTimerRef.current) {
    clearTimeout(runtime.actionBarSaveTimerRef.current);
    runtime.actionBarSaveTimerRef.current = null;
    runtime.clientRef.current?.updateActionBar(
      runtime.actionBarRef.current,
      runtime.actionBotSettingsRef.current,
    );
  }
  if (runtime.uiSettingsSaveTimerRef.current) {
    clearTimeout(runtime.uiSettingsSaveTimerRef.current);
    runtime.uiSettingsSaveTimerRef.current = null;
    runtime.clientRef.current?.updateUiSettings(runtime.uiSettingsRef.current);
  }
}
