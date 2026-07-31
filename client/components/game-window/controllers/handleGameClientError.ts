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
  const showPuff =
    code === "combat-action-failed" ||
    code === "item-action-failed" ||
    code === "item-exhausted" ||
    code === "player-full" ||
    code.startsWith("spell-") ||
    code.startsWith("potion-");

  if (code === "item-action-failed") {
    actions?.inventory.rollback();
    renderer.clearMapItemPreviews();
  }
  // A refused gameplay action reads as Canary does it: the puff on the player
  // and nothing else. No banner, no toast.
  if (showPuff) {
    if (state.ownCharacter) {
      renderer.showLocalMagicEffect(state.ownCharacter.position, 3);
    }
    return;
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
