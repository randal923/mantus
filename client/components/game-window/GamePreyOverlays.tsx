import { useAppTranslation } from "../../i18n/useAppTranslation";
import { HuntingTasksModal } from "../hunting/HuntingTasksModal";
import { PreyModal } from "../prey/PreyModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GamePreyOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const preyWindowOpen = useGameWindowStore((state) => state.preyWindowOpen);
  const huntingTasksOpen = useGameWindowStore(
    (state) => state.huntingTasksOpen,
  );
  const preySession = useGameWindowStore(
    (state) => state.sessions?.prey ?? null,
  );
  const huntingTasksSession = useGameWindowStore(
    (state) => state.sessions?.huntingTasks ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setPreyWindowOpen = useGameWindowStore(
    (state) => state.setPreyWindowOpen,
  );
  const setHuntingTasksOpen = useGameWindowStore(
    (state) => state.setHuntingTasksOpen,
  );
  if (!ownCharacter || !preySession || !huntingTasksSession || !sessionActions) {
    return null;
  }

  const preyError = preySession.error
    ? t(`prey.errors.${preySession.error}`, {
        defaultValue: t("prey.errors.invalid-request"),
      })
    : null;
  const huntingTasksError = huntingTasksSession.error
    ? t(`huntingTasks.errors.${huntingTasksSession.error}`, {
        defaultValue: t("huntingTasks.errors.invalid-request"),
      })
    : null;

  return (
    <>
      {preyWindowOpen && (
        <PreyModal
          prey={preySession.state}
          pending={preySession.pending}
          error={preyError}
          onAction={(action, slot, extras) => {
            const sent =
              runtime.clientRef.current?.preyAction(action, slot, extras) ??
              false;
            sessionActions.prey.begin(sent);
          }}
          onClose={() => {
            setPreyWindowOpen(false);
            sessionActions.prey.dismissError();
          }}
        />
      )}
      {huntingTasksOpen && (
        <HuntingTasksModal
          tasks={huntingTasksSession.state}
          pending={huntingTasksSession.pending}
          error={huntingTasksError}
          onAction={(action, slot, extras) => {
            const sent =
              runtime.clientRef.current?.huntingTaskAction(
                action,
                slot,
                extras,
              ) ?? false;
            sessionActions.huntingTasks.begin(sent);
          }}
          onClose={() => {
            setHuntingTasksOpen(false);
            sessionActions.huntingTasks.dismissError();
          }}
        />
      )}
    </>
  );
}
