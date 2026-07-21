import type { ServerMessage } from "@tibia/protocol";
import { formatChatTime } from "../../../lib/chat/formatChatTime";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handleDialogueMessage(
  message: ServerMessage,
  { store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();

  if (message.type === "creature-spoke") {
    state.dispatchChat({
      type: "spoke",
      creatureId: message.creatureId,
      name: message.name,
      mode: message.mode,
      body: message.text,
      time: formatChatTime(),
    });
    return false;
  }

  if (message.type === "npc-dialogue") {
    state.setNpcDialogue(message);
    state.dispatchChat({
      type: "spoke",
      creatureId: message.npcId,
      name: message.npcName,
      mode: "say",
      body: message.text,
      time: formatChatTime(),
    });
    return false;
  }

  if (message.type === "npc-dialogue-closed") {
    state.setNpcDialogue((current) =>
      current?.npcId === message.npcId &&
      current.conversationId === message.conversationId
        ? null
        : current,
    );
    state.setShopSession((current) =>
      current?.npcId === message.npcId ? null : current,
    );
  }

  return false;
}
