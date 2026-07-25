import { randomUUID } from "node:crypto";
import type { Npc } from "../creature/Npc";
import type { ShopService } from "../economy/ShopService";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import type { NpcConversation } from "./NpcConversation";
import type { NpcConversations } from "./NpcConversations";
import { sendNpcDialogueResponses } from "./sendNpcDialogueResponses";

export class NpcDialogueFlow {
  constructor(
    private readonly conversations: NpcConversations,
    private readonly visibility: Visibility,
    private readonly shops: ShopService,
  ) {}

  greet(
    session: Session,
    player: Player,
    npc: Npc,
    graph: DialogueGraph,
    now: number,
  ): void {
    const conversation: NpcConversation = {
      id: randomUUID(),
      npcId: npc.id,
      playerId: player.id,
      currentNodeId: graph.rootNodeId,
      expiresAt: now + graph.timeoutMs,
      pendingAction: false,
    };
    this.conversations.set(conversation);
    npc.beginConversation(player.id);
    this.visibility.broadcastPose(npc);
    sendNpcDialogueResponses(
      session,
      player,
      npc,
      graph,
      conversation,
      graph.greeting,
    );
  }

  farewell(
    session: Session,
    player: Player,
    npc: Npc,
    conversation: NpcConversation,
  ): void {
    const graph = npc.type.dialogue;
    if (!graph) return;
    sendNpcDialogueResponses(
      session,
      player,
      npc,
      graph,
      conversation,
      graph.farewell,
      undefined,
      false,
    );
    this.close(session, npc, conversation, "farewell");
  }

  walkAway(
    session: Session,
    player: Player,
    npc: Npc,
    conversation: NpcConversation,
  ): void {
    const graph = npc.type.dialogue;
    if (!graph) return;
    sendNpcDialogueResponses(
      session,
      player,
      npc,
      graph,
      conversation,
      graph.walkAway,
      undefined,
      false,
    );
    this.close(session, npc, conversation, "walked-away");
  }

  /**
   * Speaks one `onlyUnfocus` branch to a player who has not greeted the NPC.
   * No conversation is opened, so nothing here can be replayed or continued:
   * the line is delivered privately and the exchange is over.
   */
  sayUnfocused(
    session: Session,
    player: Player,
    npc: Npc,
    node: DialogueNode,
  ): void {
    for (const response of node.responses) {
      session.send({
        type: "creature-spoke",
        creatureId: npc.id,
        name: npc.name,
        mode: "say",
        position: { ...npc.position },
        text: response.replaceAll("|PLAYERNAME|", player.name),
      });
    }
  }

  close(
    session: Session,
    npc: Npc | undefined,
    conversation: NpcConversation,
    reason:
      | "farewell"
      | "walked-away"
      | "timed-out"
      | "npc-removed"
      | "travelled",
  ): void {
    this.shops.close(session, conversation.npcId);
    this.conversations.remove(conversation, npc);
    session.send({
      type: "npc-dialogue-closed",
      npcId: conversation.npcId,
      conversationId: conversation.id,
      reason,
    });
  }
}
