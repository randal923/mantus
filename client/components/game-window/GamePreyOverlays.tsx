import { countMoneyWorth } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PreyHuntingModal } from "../prey/PreyHuntingModal";
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
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
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
  if (!preyWindowOpen && !huntingTasksOpen) return null;

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
    <PreyHuntingModal
      tab={huntingTasksOpen && !preyWindowOpen ? "hunting-tasks" : "prey"}
      onTabChange={(tab) => {
        setPreyWindowOpen(tab === "prey");
        setHuntingTasksOpen(tab === "hunting-tasks");
      }}
      prey={preySession.state}
      preyPending={preySession.pending}
      preyError={preyError}
      onPreyAction={(action, slot, extras) => {
        const sent =
          runtime.clientRef.current?.preyAction(action, slot, extras) ?? false;
        sessionActions.prey.begin(sent);
      }}
      tasks={huntingTasksSession.state}
      tasksPending={huntingTasksSession.pending}
      tasksError={huntingTasksError}
      onTaskAction={(action, slot, extras) => {
        const sent =
          runtime.clientRef.current?.huntingTaskAction(action, slot, extras) ??
          false;
        sessionActions.huntingTasks.begin(sent);
      }}
      gold={inventory ? countMoneyWorth(inventory) : 0}
      onClose={() => {
        setPreyWindowOpen(false);
        setHuntingTasksOpen(false);
        sessionActions.prey.dismissError();
        sessionActions.huntingTasks.dismissError();
      }}
    />
  );
}
