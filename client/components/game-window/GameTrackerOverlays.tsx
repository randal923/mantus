"use client";

import { TrackerPanel } from "../tracker/TrackerPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameTrackerOverlays() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const trackerVisible = useGameWindowStore((state) => state.trackerVisible);
  const tracker = useGameWindowStore(
    (state) => state.sessions?.tracker ?? null,
  );
  const setTrackerVisible = useGameWindowStore(
    (state) => state.setTrackerVisible,
  );
  if (!ownCharacter || !trackerVisible || !tracker) return null;

  const bestiaryEntries = tracker.bestiary ?? [];
  const bosstiaryEntries = tracker.bosstiary ?? [];

  return (
    <div className="pointer-events-none absolute top-24 bottom-4 left-4 z-20 flex items-start">
      <TrackerPanel
        bestiaryEntries={bestiaryEntries}
        bosstiaryEntries={bosstiaryEntries}
        onRemove={(scope, raceId) => {
          runtime.clientRef.current?.setTracker(scope, raceId, false);
        }}
        onClose={() => setTrackerVisible(false)}
      />
    </div>
  );
}
