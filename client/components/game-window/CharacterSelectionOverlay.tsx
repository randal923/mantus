import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CharacterSelectScreen } from "../characters/CharacterSelectScreen";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function CharacterSelectionOverlay() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const status = useGameWindowStore((state) => state.status);
  const characters = useGameWindowStore((state) => state.characters);
  const creationOptions = useGameWindowStore(
    (state) => state.creationOptions,
  );
  const accountTier = useGameWindowStore((state) => state.accountTier);
  const premiumDaysRemaining = useGameWindowStore(
    (state) => state.premiumDaysRemaining,
  );
  const busy = useGameWindowStore((state) => state.characterBusy);
  const serverError = useGameWindowStore((state) => state.serverError);
  const onLogout = useGameWindowStore((state) => state.onLogout);
  const setBusy = useGameWindowStore((state) => state.setCharacterBusy);
  const setServerError = useGameWindowStore((state) => state.setServerError);
  const reconnect = useGameWindowStore((state) => state.reconnect);

  return (
    <CharacterSelectScreen
      status={status}
      characters={characters}
      creationOptions={creationOptions}
      accountTier={accountTier}
      premiumDaysRemaining={premiumDaysRemaining}
      busy={busy}
      error={
        serverError
          ? t(`serverErrors.${serverError}`, {
              defaultValue: t("serverErrors.unknown"),
            })
          : null
      }
      onLogout={onLogout}
      onReconnect={() => reconnect(null)}
      onCreate={(input) => {
        setServerError(null);
        if (runtime.clientRef.current?.createCharacter(input)) {
          setBusy(true);
          return;
        }
        setServerError("character-list-failed");
      }}
      onSelect={(characterId) => {
        setServerError(null);
        if (runtime.clientRef.current?.selectCharacter(characterId)) {
          setBusy(true);
          return;
        }
        setServerError("character-load-failed");
      }}
    />
  );
}
