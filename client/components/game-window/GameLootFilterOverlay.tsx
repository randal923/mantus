import { LootFilterModal } from "../loot-filter/LootFilterModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameLootFilterOverlay() {
  const store = useGameWindowStoreApi();
  const open = useGameWindowStore((state) => state.lootFilterOpen);
  const filter = useGameWindowStore((state) => state.lootFilter);
  const items = useGameWindowStore((state) => state.lootFilterItems);
  const setLootFilter = useGameWindowStore((state) => state.setLootFilter);
  const setLootFilterOpen = useGameWindowStore(
    (state) => state.setLootFilterOpen,
  );

  if (!open) return null;
  return (
    <LootFilterModal
      filter={filter}
      carried={items.carried}
      ignored={items.ignored}
      onChange={(next) => {
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
        }, 800);
      }}
      onClose={() => setLootFilterOpen(false)}
    />
  );
}
