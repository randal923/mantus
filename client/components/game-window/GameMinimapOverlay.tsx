"use client";

import type { MinimapLayout } from "@tibia/protocol";
import { MinimapPanel } from "../minimap/MinimapPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameMinimapOverlay() {
  const store = useGameWindowStoreApi();
  const mapName = useGameWindowStore((state) => state.mapName);
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const visibleCreatures = useGameWindowStore(
    (state) => state.visibleCreatures,
  );
  const minimapLayout = useGameWindowStore(
    (state) => state.uiSettings.minimap ?? null,
  );
  const setUiSettings = useGameWindowStore((state) => state.setUiSettings);
  const mapMarkers = useGameWindowStore((state) => state.mapMarkers);
  const trackedRoute = useGameWindowStore((state) => state.trackedHuntRoute);
  if (!mapName || !ownCharacter) return null;

  const onLayoutChange = (layout: MinimapLayout) => {
    const runtime = store.getState().runtime;
    const next = { ...runtime.uiSettingsRef.current, minimap: layout };
    runtime.uiSettingsRef.current = next;
    setUiSettings(next);
    if (runtime.uiSettingsSaveTimerRef.current) {
      clearTimeout(runtime.uiSettingsSaveTimerRef.current);
    }
    runtime.uiSettingsSaveTimerRef.current = setTimeout(() => {
      runtime.uiSettingsSaveTimerRef.current = null;
      runtime.clientRef.current?.updateUiSettings(
        runtime.uiSettingsRef.current,
      );
    }, 800);
  };

  return (
    <MinimapPanel
      mapName={mapName}
      ownPlayerId={ownCharacter.id}
      ownPosition={ownCharacter.position}
      creatures={visibleCreatures}
      layout={minimapLayout}
      mapMarkers={mapMarkers}
      trackedRoute={trackedRoute}
      onLayoutChange={onLayoutChange}
      onWalkTo={(position) =>
        store.getState().runtime.clientRef.current?.walkTo(position)
      }
      onToggleMarker={(position) => {
        const client = store.getState().runtime.clientRef.current;
        const existing = mapMarkers.some(
          (marker) =>
            marker.position.x === position.x &&
            marker.position.y === position.y &&
            marker.position.z === position.z,
        );
        if (existing) client?.deleteMapMarker(position);
        else client?.setMapMarker(position, 0, "");
      }}
    />
  );
}
