import type { Language, ServerErrorCode } from "@tibia/protocol";
import type { WorldRenderer } from "../../../lib/render/WorldRenderer";
import type { GameWindowStore } from "../types/GameWindowStore";

export function handleGameClientError(
  code: ServerErrorCode,
  renderer: WorldRenderer,
  setLanguage: (language: Language) => void,
  store: GameWindowStore,
): void {
  const state = store.getState();
  const actions = state.sessionActions;
  const { runtime } = state;

  if (code === "item-action-failed") {
    actions?.inventory.rollback();
    renderer.clearMapItemPreviews();
  }
  if (code === "language-update-failed") {
    setLanguage(runtime.confirmedLanguageRef.current);
    state.setLanguageSaving(false);
    state.setLanguageError(true);
    return;
  }
  if (
    code === "ui-settings-update-failed" ||
    code === "ui-settings-update-pending"
  ) {
    return;
  }
  runtime.resumeCharacterIdRef.current = null;
  if (code !== "language-update-pending") state.setLanguageSaving(false);
  state.setCharacterBusy(false);
  state.setServerError(code);
}
