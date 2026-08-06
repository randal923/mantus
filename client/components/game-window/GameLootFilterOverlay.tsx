import { useCallback } from "react";
import type { BestiaryCreatureEntry, LootFilter } from "@tibia/protocol";
import { LootFilterModal } from "../loot-filter/LootFilterModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

const EMPTY_CREATURES: ReadonlyArray<BestiaryCreatureEntry> = [];
/** Matches the other settings windows: coalesce a burst of edits into one save. */
const SAVE_DEBOUNCE_MS = 800;

export function GameLootFilterOverlay() {
  const store = useGameWindowStoreApi();
  const open = useGameWindowStore((state) => state.lootFilterOpen);
  const filter = useGameWindowStore((state) => state.lootFilter);
  const items = useGameWindowStore((state) => state.lootFilterItems);
  const creatures = useGameWindowStore(
    (state) => state.sessions?.bestiary.creatures?.entries ?? EMPTY_CREATURES,
  );
  const monster = useGameWindowStore(
    (state) => state.sessions?.bestiary.monster ?? null,
  );
  const monsterPending = useGameWindowStore(
    (state) => state.sessions?.bestiary.pending ?? false,
  );
  const setLootFilter = useGameWindowStore((state) => state.setLootFilter);
  const setLootFilterOpen = useGameWindowStore(
    (state) => state.setLootFilterOpen,
  );

  const onRequestMonster = useCallback(
    (raceId: number) => {
      const state = store.getState();
      const sent =
        state.runtime.clientRef.current?.requestBestiaryMonster(raceId) ??
        false;
      state.sessionActions?.bestiary.begin(sent);
    },
    [store],
  );

  const onChange = useCallback(
    (next: LootFilter) => {
      const runtime = store.getState().runtime;
      setLootFilter(next);
      runtime.lootFilterRef.current = next;
      if (runtime.lootFilterSaveTimerRef.current) {
        clearTimeout(runtime.lootFilterSaveTimerRef.current);
      }
      runtime.lootFilterSaveTimerRef.current = setTimeout(() => {
        runtime.lootFilterSaveTimerRef.current = null;
        runtime.clientRef.current?.updateLootFilter(
          runtime.lootFilterRef.current,
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [setLootFilter, store],
  );

  const onClose = useCallback(
    () => setLootFilterOpen(false),
    [setLootFilterOpen],
  );

  if (!open) return null;
  return (
    <LootFilterModal
      filter={filter}
      carried={items.carried}
      types={items.types}
      creatures={creatures}
      monster={monster}
      monsterPending={monsterPending}
      onRequestMonster={onRequestMonster}
      onChange={onChange}
      onClose={onClose}
    />
  );
}
