import { NpcDialogue } from "../npc/NpcDialogue";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function NpcDialogueOverlay() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const dialogue = useGameWindowStore((state) => state.npcDialogue);
  const travelPending = useGameWindowStore((state) => state.npcTravelPending);
  if (!dialogue) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-24 z-30 flex justify-center">
      <NpcDialogue
        dialogue={dialogue}
        travelPending={travelPending}
        onChoice={(choice) => {
          if (store.getState().npcTravelPending) return;
          const sent = runtime.clientRef.current?.sendNpcDialogueChoice(
            dialogue.npcId,
            dialogue.conversationId,
            choice.id,
          ) ?? false;
          if (sent && choice.action === "travel") {
            store.getState().setNpcTravelPending(true);
          }
        }}
      />
    </div>
  );
}
