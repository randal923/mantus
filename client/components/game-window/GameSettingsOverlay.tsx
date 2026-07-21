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
  const setLanguageSaving = useGameWindowStore(
    (state) => state.setLanguageSaving,
  );
  const setLanguageError = useGameWindowStore(
    (state) => state.setLanguageError,
  );
  const setGameMenuOpen = useGameWindowStore(
    (state) => state.setGameMenuOpen,
  );
  const gameMenuOpen = useGameWindowStore((state) => state.gameMenuOpen);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const diagonalWalking = useGameSettingsStore(
    (state) => state.diagonalWalking,
  );
  const setDiagonalWalking = useGameSettingsStore(
    (state) => state.setDiagonalWalking,
  );

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
