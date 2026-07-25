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
        const client = runtime.clientRef.current;
        // A map item's text goes through the world-action write intent; a
        // carried item's through the owned-item one.
        const sent = item.position
          ? client?.writeMapItem(
              item.itemId,
              item.revision,
              item.position,
              text,
            )
          : client?.writeItem(item.itemId, item.revision, text);
        if (sent) setItem(null);
      }}
    />
  );
}
