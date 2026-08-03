"use client";

import { ImbuementTrackerPanel } from "../imbuement/ImbuementTrackerPanel";
import { TrackerPanel } from "../tracker/TrackerPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

/** The left-hand tracker dock: kill tracker on top, imbuement tracker below. */
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
  const imbuementTrackerVisible = useGameWindowStore(
    (state) => state.imbuementTrackerVisible,
  );
  const setImbuementTrackerVisible = useGameWindowStore(
    (state) => state.setImbuementTrackerVisible,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const inFight = useGameWindowStore(
    (state) =>
      state.fightState?.conditions.some(
        (condition) => condition.type === "combat-lock",
      ) ?? false,
  );
  const inProtectionZone = useGameWindowStore(
    (state) => state.fightState?.inProtectionZone ?? false,
  );
  if (!ownCharacter) return null;

  const showKillTracker = trackerVisible && tracker !== null;
  const showImbuementTracker = imbuementTrackerVisible && inventory !== null;
  if (!showKillTracker && !showImbuementTracker) return null;

  return (
    <div className="pointer-events-none absolute top-24 bottom-4 left-4 z-20 flex flex-col items-start gap-2 overflow-hidden">
      {showKillTracker && (
        <TrackerPanel
          bestiaryEntries={tracker.bestiary ?? []}
          bosstiaryEntries={tracker.bosstiary ?? []}
          onRemove={(scope, raceId) => {
            runtime.clientRef.current?.setTracker(scope, raceId, false);
          }}
          onClose={() => setTrackerVisible(false)}
        />
      )}
      {showImbuementTracker && (
        <ImbuementTrackerPanel
          inventory={inventory}
          inFight={inFight}
          inProtectionZone={inProtectionZone}
          onClose={() => setImbuementTrackerVisible(false)}
        />
      )}
    </div>
  );
}
