import { NpcDialogue } from "../npc/NpcDialogue";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function NpcDialogueOverlay() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const dialogue = useGameWindowStore((state) => state.npcDialogue);
  if (!dialogue) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-24 z-30 flex justify-center">
      <NpcDialogue
        dialogue={dialogue}
        onChoice={(choiceId) =>
          runtime.clientRef.current?.sendNpcDialogueChoice(
            dialogue.npcId,
            dialogue.conversationId,
            choiceId,
          )
        }
      />
    </div>
  );
}
