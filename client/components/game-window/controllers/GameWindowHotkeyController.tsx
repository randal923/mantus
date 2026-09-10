import { useMemo } from "react";
import { useHotkeys } from "../../../hooks/useHotkeys";
import { nextAttackTarget } from "../../../lib/game-window/nextAttackTarget";
import { isCombatBindingAction } from "../../../lib/hotkeys/keyBindings";
import { createPanelActions } from "../createPanelActions";
import { useGameWindowStore } from "../store/useGameWindowStore";
import { useGameWindowStoreApi } from "../store/useGameWindowStoreApi";

export function GameWindowHotkeyController() {
  const store = useGameWindowStoreApi();
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const panelActions = useMemo(() => createPanelActions(store), [store]);

  useHotkeys((action) => {
    if (!ownCharacter) return;
    const state = store.getState();
    if (action === "toggleGameMenu") {
      state.setInventoryOpen(false);
      state.setCharacterStatsOpen(false);
      state.setGameMenuOpen((open) => !open);
      return;
    }
    // While the game menu modal is up, only the menu toggle stays live.
    if (state.gameMenuOpen) return;
    if (isCombatBindingAction(action)) {
      const own = state.ownCharacter ?? ownCharacter;
      const targetId = nextAttackTarget(
        state.visibleCreatures,
        own.position,
        state.fightState?.attackTargetId ?? null,
        action === "nextTarget" ? 1 : -1,
      );
      if (targetId) state.runtime.clientRef.current?.attackTarget(targetId);
      return;
    }
    panelActions[action]();
  });

  return null;
}
