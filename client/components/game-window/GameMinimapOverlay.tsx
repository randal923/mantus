"use client";

import { useCallback } from "react";
import type { MinimapLayout, Position } from "@tibia/protocol";
import { useThrottledValue } from "../../lib/minimap/useThrottledValue";
import { MinimapPanel } from "../minimap/MinimapPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

/**
 * Creature markers advance at ~10 Hz instead of every animation frame; in a
 * crowded hunt the per-frame marker churn is by far the most expensive part
 * of the minimap. Pan, zoom, and floor changes still render immediately.
 */
const MARKER_UPDATE_INTERVAL_MS = 100;

export function GameMinimapOverlay() {
  const store = useGameWindowStoreApi();
  const mapName = useGameWindowStore((state) => state.mapName);
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const visibleCreatures = useGameWindowStore(
    (state) => state.visibleCreatures,
  );
  const drawnCreatures = useThrottledValue(
    visibleCreatures,
    MARKER_UPDATE_INTERVAL_MS,
  );
  const minimapLayout = useGameWindowStore(
    (state) => state.uiSettings.minimap ?? null,
  );
  const setUiSettings = useGameWindowStore((state) => state.setUiSettings);
  const mapMarkers = useGameWindowStore((state) => state.mapMarkers);
  const trackedRoute = useGameWindowStore((state) => state.trackedHuntRoute);

  const onLayoutChange = useCallback(
    (layout: MinimapLayout) => {
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
    },
    [store, setUiSettings],
  );
  const onWalkTo = useCallback(
    (position: Position) => {
      store.getState().runtime.clientRef.current?.walkTo(position);
    },
    [store],
  );
  const onToggleMarker = useCallback(
    (position: Position) => {
      const client = store.getState().runtime.clientRef.current;
      const existing = mapMarkers.some(
        (marker) =>
          marker.position.x === position.x &&
          marker.position.y === position.y &&
          marker.position.z === position.z,
      );
      if (existing) client?.deleteMapMarker(position);
      else client?.setMapMarker(position, 0, "");
    },
    [store, mapMarkers],
  );

  if (!mapName || !ownCharacter) return null;

  return (
    <MinimapPanel
      mapName={mapName}
      ownPlayerId={ownCharacter.id}
      ownPosition={ownCharacter.position}
      creatures={drawnCreatures}
      layout={minimapLayout}
      mapMarkers={mapMarkers}
      trackedRoute={trackedRoute}
      onLayoutChange={onLayoutChange}
      onWalkTo={onWalkTo}
      onToggleMarker={onToggleMarker}
    />
  );
}
