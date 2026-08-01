import { useCallback } from "react";
import type { BestiaryCreatureEntry, HuntingBotRoute, Position } from "@tibia/protocol";
import { HuntingBotModal } from "../hunting-bot/HuntingBotModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

const EMPTY_CREATURES: ReadonlyArray<BestiaryCreatureEntry> = [];
/** Matches the other settings windows: coalesce a burst of edits into one save. */
const SAVE_DEBOUNCE_MS = 800;

export function GameHuntingBotOverlay() {
  const store = useGameWindowStoreApi();
  const open = useGameWindowStore((state) => state.huntingBotOpen);
  const character = useGameWindowStore((state) => state.ownCharacter);
  const mapName = useGameWindowStore((state) => state.mapName);
  const creatures = useGameWindowStore(
    (state) => state.sessions?.bestiary.creatures?.entries ?? EMPTY_CREATURES,
  );
  const route = useGameWindowStore((state) => state.huntingBotRoute);
  const status = useGameWindowStore((state) => state.huntingBotStatus);
  const error = useGameWindowStore((state) => state.huntingBotError);
  const unresolvedIndexes = useGameWindowStore(
    (state) => state.huntingBotUnresolved,
  );
  const tracing = useGameWindowStore((state) => state.huntingBotTracing);
  const setRoute = useGameWindowStore((state) => state.setHuntingBotRoute);
  const setUnresolved = useGameWindowStore(
    (state) => state.setHuntingBotUnresolved,
  );
  const setTracing = useGameWindowStore((state) => state.setHuntingBotTracing);
  const setOpen = useGameWindowStore((state) => state.setHuntingBotOpen);

  const onRouteChange = useCallback(
    (next: HuntingBotRoute) => {
      const runtime = store.getState().runtime;
      setRoute(next);
      // Any hand edit renumbers the chain, so the last trace's flags no
      // longer point at the waypoints they were about.
      setUnresolved([]);
      runtime.huntingBotRouteRef.current = next;
      if (runtime.huntingBotSaveTimerRef.current) {
        clearTimeout(runtime.huntingBotSaveTimerRef.current);
      }
      runtime.huntingBotSaveTimerRef.current = setTimeout(() => {
        runtime.huntingBotSaveTimerRef.current = null;
        runtime.clientRef.current?.updateHuntingBotRoute(
          runtime.huntingBotRouteRef.current,
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [setRoute, setUnresolved, store],
  );

  const onTrace = useCallback(
    (points: ReadonlyArray<Position>) => {
      setTracing(true);
      store.getState().runtime.clientRef.current?.traceHuntingBotRoute(points);
    },
    [setTracing, store],
  );

  const onStart = useCallback(() => {
    const runtime = store.getState().runtime;
    // The server walks what it has stored, so an edit still sitting in the
    // debounce has to land before the bot is armed.
    if (runtime.huntingBotSaveTimerRef.current) {
      clearTimeout(runtime.huntingBotSaveTimerRef.current);
      runtime.huntingBotSaveTimerRef.current = null;
      runtime.clientRef.current?.updateHuntingBotRoute(
        runtime.huntingBotRouteRef.current,
      );
    }
    runtime.clientRef.current?.setHuntingBotEnabled(true);
  }, [store]);

  const onStop = useCallback(() => {
    store.getState().runtime.clientRef.current?.setHuntingBotEnabled(false);
  }, [store]);

  const onClose = useCallback(() => setOpen(false), [setOpen]);

  if (!open || !character || !mapName) return null;

  return (
    <HuntingBotModal
      characterVocation={character.vocation}
      mapName={mapName}
      ownPosition={character.position}
      creatures={creatures}
      route={route}
      status={status}
      error={error}
      unresolvedIndexes={unresolvedIndexes}
      tracing={tracing}
      onRouteChange={onRouteChange}
      onTrace={onTrace}
      onStart={onStart}
      onStop={onStop}
      onClose={onClose}
    />
  );
}
