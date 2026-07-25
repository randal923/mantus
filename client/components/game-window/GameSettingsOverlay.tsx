import { useCallback } from "react";
import {
  DEFAULT_TURN_MODIFIER,
  type TurnModifier,
} from "@tibia/protocol";
import { useGameSettingsStore } from "../../stores/useGameSettingsStore";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { GameMenuModal } from "../settings/GameMenuModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameSettingsOverlay() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const accountTier = useGameWindowStore((state) => state.accountTier);
  const premiumDaysRemaining = useGameWindowStore(
    (state) => state.premiumDaysRemaining,
  );
  const onLogout = useGameWindowStore((state) => state.onLogout);
  const languageSaving = useGameWindowStore(
    (state) => state.languageSaving,
  );
  const languageError = useGameWindowStore((state) => state.languageError);
  const turnModifier = useGameWindowStore(
    (state) => state.uiSettings.turnModifier ?? DEFAULT_TURN_MODIFIER,
  );
  const setLanguageSaving = useGameWindowStore(
    (state) => state.setLanguageSaving,
  );
  const setLanguageError = useGameWindowStore(
    (state) => state.setLanguageError,
  );
  const setGameMenuOpen = useGameWindowStore(
    (state) => state.setGameMenuOpen,
  );
  const setUiSettings = useGameWindowStore((state) => state.setUiSettings);
  const gameMenuOpen = useGameWindowStore((state) => state.gameMenuOpen);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const diagonalWalking = useGameSettingsStore(
    (state) => state.diagonalWalking,
  );
  const setDiagonalWalking = useGameSettingsStore(
    (state) => state.setDiagonalWalking,
  );

  const onTurnModifierChange = useCallback(
    (nextTurnModifier: TurnModifier) => {
      const currentRuntime = store.getState().runtime;
      const next = {
        ...currentRuntime.uiSettingsRef.current,
        turnModifier: nextTurnModifier,
      };
      currentRuntime.uiSettingsRef.current = next;
      setUiSettings(next);
      if (currentRuntime.uiSettingsSaveTimerRef.current) {
        clearTimeout(currentRuntime.uiSettingsSaveTimerRef.current);
      }
      currentRuntime.uiSettingsSaveTimerRef.current = setTimeout(() => {
        currentRuntime.uiSettingsSaveTimerRef.current = null;
        currentRuntime.clientRef.current?.updateUiSettings(
          currentRuntime.uiSettingsRef.current,
        );
      }, 800);
    },
    [setUiSettings, store],
  );

  /**
   * Drops every stored panel layout, keeping the non-layout preferences. The
   * server persists the result immediately (no debounce) and echoes it to
   * every live session of the account.
   */
  const onResetLayout = () => {
    const currentRuntime = store.getState().runtime;
    const { minimap, chat, battleList, spellBar, ...kept } =
      currentRuntime.uiSettingsRef.current;
    void minimap;
    void chat;
    void battleList;
    void spellBar;
    currentRuntime.uiSettingsRef.current = kept;
    setUiSettings(kept);
    if (currentRuntime.uiSettingsSaveTimerRef.current) {
      clearTimeout(currentRuntime.uiSettingsSaveTimerRef.current);
      currentRuntime.uiSettingsSaveTimerRef.current = null;
    }
    currentRuntime.clientRef.current?.updateUiSettings(kept);
  };

  if (!gameMenuOpen) return null;

  return (
    <GameMenuModal
      onClose={() => setGameMenuOpen(false)}
      accountTier={accountTier}
      premiumDaysRemaining={premiumDaysRemaining}
      onLogout={onLogout}
      languageSaving={languageSaving}
      languageError={languageError}
      diagonalWalking={diagonalWalking}
      onDiagonalWalkingChange={setDiagonalWalking}
      turnModifier={turnModifier}
      onTurnModifierChange={onTurnModifierChange}
      onResetLayout={onResetLayout}
      onChangeLanguage={(nextLanguage) => {
        setLanguage(nextLanguage);
        setLanguageSaving(true);
        setLanguageError(false);
        if (runtime.clientRef.current?.updateLanguage(nextLanguage)) return;
        setLanguage(runtime.confirmedLanguageRef.current);
        setLanguageSaving(false);
        setLanguageError(true);
      }}
    />
  );
}
