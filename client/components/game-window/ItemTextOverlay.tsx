import { ItemTextModal } from "../inventory/ItemTextModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function ItemTextOverlay() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const item = useGameWindowStore((state) => state.itemText);
  const setItem = useGameWindowStore((state) => state.setItemText);
  if (!item) return null;

  return (
    <ItemTextModal
      key={`${item.itemId}:${item.revision}`}
      item={item}
      onClose={() => setItem(null)}
      onSave={(text) => {
        if (
          runtime.clientRef.current?.writeItem(
            item.itemId,
            item.revision,
            text,
          )
        ) {
          setItem(null);
        }
      }}
    />
  );
}
