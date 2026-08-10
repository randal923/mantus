import { useMemo } from "react";
import { useHotkeys } from "../../../hooks/useHotkeys";
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
    panelActions[action]();
  });

  return null;
}
