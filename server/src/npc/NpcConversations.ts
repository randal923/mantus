import type { Npc } from "../creature/Npc";
import type { NpcConversation } from "./NpcConversation";
import { npcConversationKey } from "./npcConversationKey";

export class NpcConversations {
  private readonly conversations = new Map<string, NpcConversation>();

  get(npcId: string, playerId: string): NpcConversation | undefined {
    return this.conversations.get(npcConversationKey(npcId, playerId));
  }

  set(conversation: NpcConversation): void {
    this.conversations.set(
      npcConversationKey(conversation.npcId, conversation.playerId),
      conversation,
    );
  }

  values(): NpcConversation[] {
    return [...this.conversations.values()];
  }

  remove(conversation: NpcConversation, npc?: Npc): void {
    const key = npcConversationKey(conversation.npcId, conversation.playerId);
    if (this.conversations.get(key) !== conversation) return;
    this.conversations.delete(key);
    npc?.endConversation(conversation.playerId);
  }

  isCurrent(conversation: NpcConversation): boolean {
    return (
      this.conversations.get(
        npcConversationKey(conversation.npcId, conversation.playerId),
      ) === conversation
    );
  }
}
