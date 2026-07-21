import { useCallback } from "react";
import { CharacterSelectionOverlay } from "./CharacterSelectionOverlay";
import { GameWorldView } from "./GameWorldView";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameWindowView() {
  const store = useGameWindowStoreApi();
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const targeting = useGameWindowStore(
    (state) =>
      state.runeTargeting || state.potionTargeting || state.useWithTargeting,
  );
  const setContainer = useCallback(
    (container: HTMLDivElement | null) => {
      store.getState().runtime.containerRef.current = container;
    },
    [store],
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div
        ref={setContainer}
        className={`absolute inset-0 ${targeting ? "cursor-crosshair" : ""}`}
      />
      <div
        aria-hidden
        className="ui-game-vignette pointer-events-none absolute inset-0 z-10"
      />
      {ownCharacter ? <GameWorldView /> : <CharacterSelectionOverlay />}
    </div>
  );
}
