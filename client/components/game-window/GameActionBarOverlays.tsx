import { PotionActionBarModal } from "../action-bar/PotionActionBarModal";
import { ActionBarModal } from "../spells/ActionBarModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameActionBarOverlays() {
  const store = useGameWindowStoreApi();
  const spells = useGameWindowStore((state) => state.spells);
  const actionBar = useGameWindowStore((state) => state.actionBar);
  const potionActionBar = useGameWindowStore(
    (state) => state.potionActionBar,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const actionBarConfigSlot = useGameWindowStore(
    (state) => state.actionBarConfigSlot,
  );
  const potionActionBarConfigSlot = useGameWindowStore(
    (state) => state.potionActionBarConfigSlot,
  );
  const setActionBar = useGameWindowStore((state) => state.setActionBar);
  const setPotionActionBar = useGameWindowStore(
    (state) => state.setPotionActionBar,
  );
  const setActionBarConfigSlot = useGameWindowStore(
    (state) => state.setActionBarConfigSlot,
  );
  const setPotionActionBarConfigSlot = useGameWindowStore(
    (state) => state.setPotionActionBarConfigSlot,
  );

  return (
    <>
      {actionBarConfigSlot !== null && (
        <ActionBarModal
          spells={spells}
          actionBar={actionBar}
          initialSlot={actionBarConfigSlot}
          onChange={(next) => {
            const runtime = store.getState().runtime;
            setActionBar(next);
            runtime.actionBarRef.current = next;
            if (runtime.actionBarSaveTimerRef.current) {
              clearTimeout(runtime.actionBarSaveTimerRef.current);
            }
            runtime.actionBarSaveTimerRef.current = setTimeout(() => {
              runtime.actionBarSaveTimerRef.current = null;
              runtime.clientRef.current?.updateActionBar(
                runtime.actionBarRef.current,
              );
            }, 800);
          }}
          onClose={() => setActionBarConfigSlot(null)}
        />
      )}
      {potionActionBarConfigSlot !== null && (
        <PotionActionBarModal
          inventory={inventory}
          potionActionBar={potionActionBar}
          initialSlot={potionActionBarConfigSlot}
          onChange={(next) => {
            const runtime = store.getState().runtime;
            setPotionActionBar(next);
            runtime.potionActionBarRef.current = next;
            if (runtime.potionActionBarSaveTimerRef.current) {
              clearTimeout(runtime.potionActionBarSaveTimerRef.current);
            }
            runtime.potionActionBarSaveTimerRef.current = setTimeout(() => {
              runtime.potionActionBarSaveTimerRef.current = null;
              runtime.clientRef.current?.updatePotionActionBar(
                runtime.potionActionBarRef.current,
              );
            }, 800);
          }}
          onClose={() => setPotionActionBarConfigSlot(null)}
        />
      )}
    </>
  );
}
