import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { HuntFinderModal } from "../hunt-finder/HuntFinderModal";
import { useGameWindowStore } from "./store/useGameWindowStore";

const EMPTY_CREATURES: ReadonlyArray<BestiaryCreatureEntry> = [];

export function GameHuntFinderOverlay() {
  const open = useGameWindowStore((state) => state.huntFinderOpen);
  const character = useGameWindowStore((state) => state.ownCharacter);
  const mapName = useGameWindowStore((state) => state.mapName);
  const creatures = useGameWindowStore(
    (state) =>
      state.sessions?.bestiary.creatures?.entries ?? EMPTY_CREATURES,
  );
  const trackedRoute = useGameWindowStore((state) => state.trackedHuntRoute);
  const setOpen = useGameWindowStore((state) => state.setHuntFinderOpen);
  const setMinimapVisible = useGameWindowStore(
    (state) => state.setMinimapVisible,
  );
  const setTrackedRoute = useGameWindowStore(
    (state) => state.setTrackedHuntRoute,
  );
  if (!open || !character || !mapName) return null;

  return (
    <HuntFinderModal
      characterVocation={character.vocation}
      mapName={mapName}
      creatures={creatures}
      trackedRoute={trackedRoute}
      onTrackedRouteChange={(route) => {
        setTrackedRoute(route);
        if (route) setMinimapVisible(true);
      }}
      onClose={() => setOpen(false)}
    />
  );
}
