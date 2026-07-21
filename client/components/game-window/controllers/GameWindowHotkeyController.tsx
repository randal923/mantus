import { useHotkeys } from "../../../hooks/useHotkeys";
import { useGameWindowStore } from "../store/useGameWindowStore";
import { useGameWindowStoreApi } from "../store/useGameWindowStoreApi";

export function GameWindowHotkeyController() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const gameMenuOpen = useGameWindowStore((state) => state.gameMenuOpen);
  const characterStatsOpen = useGameWindowStore(
    (state) => state.characterStatsOpen,
  );
  const houseListLoaded = useGameWindowStore(
    (state) => Boolean(state.sessions?.house.list),
  );
  const setInventoryOpen = useGameWindowStore(
    (state) => state.setInventoryOpen,
  );
  const setCharacterStatsOpen = useGameWindowStore(
    (state) => state.setCharacterStatsOpen,
  );
  const setPartyPanelVisible = useGameWindowStore(
    (state) => state.setPartyPanelVisible,
  );
  const setGuildModalOpen = useGameWindowStore(
    (state) => state.setGuildModalOpen,
  );
  const setVipPanelVisible = useGameWindowStore(
    (state) => state.setVipPanelVisible,
  );
  const setHouseModalOpen = useGameWindowStore(
    (state) => state.setHouseModalOpen,
  );
  const setGameMenuOpen = useGameWindowStore(
    (state) => state.setGameMenuOpen,
  );

  useHotkeys((action) => {
    if (!ownCharacter) return;
    if (action === "toggleInventory") {
      if (gameMenuOpen) return;
      setCharacterStatsOpen(false);
      setInventoryOpen((open) => !open);
      return;
    }
    if (action === "togglePartyPanel") {
      if (gameMenuOpen) return;
      setPartyPanelVisible((visible) => !visible);
      return;
    }
    if (action === "toggleGuildModal") {
      if (gameMenuOpen) return;
      setGuildModalOpen((open) => {
        if (!open) runtime.clientRef.current?.openGuild();
        return !open;
      });
      return;
    }
    if (action === "toggleVipPanel") {
      if (gameMenuOpen) return;
      setVipPanelVisible((visible) => !visible);
      return;
    }
    if (action === "toggleHouseModal") {
      if (gameMenuOpen) return;
      setHouseModalOpen((open) => {
        if (!open) {
          runtime.clientRef.current?.openHouse();
          if (!houseListLoaded) {
            runtime.clientRef.current?.browseHouses(undefined, 0);
          }
        }
        return !open;
      });
      return;
    }
    if (action === "toggleCharacterStats") {
      setGameMenuOpen(false);
      if (characterStatsOpen) {
        setCharacterStatsOpen(false);
        setInventoryOpen(false);
        return;
      }
      setInventoryOpen(true);
      setCharacterStatsOpen(true);
      return;
    }
    setInventoryOpen(false);
    setCharacterStatsOpen(false);
    setGameMenuOpen((open) => !open);
  });

  return null;
}
