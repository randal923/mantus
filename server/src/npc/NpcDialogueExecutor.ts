import type { Npc } from "../creature/Npc";
import type { BankService } from "../economy/BankService";
import type { ShopService } from "../economy/ShopService";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import type { NpcConversation } from "./NpcConversation";
import type { NpcConversations } from "./NpcConversations";
import type { NpcDialogueFlow } from "./NpcDialogueFlow";
import { sendNpcDialogueResponses } from "./sendNpcDialogueResponses";
import type { TravelService } from "./TravelService";
import type { PromotionService } from "./PromotionService";

export class NpcDialogueExecutor {
  constructor(
    private readonly conversations: NpcConversations,
    private readonly flow: NpcDialogueFlow,
    private readonly travel: TravelService,
    private readonly bank: BankService,
    private readonly shops: ShopService,
    private readonly promotion?: PromotionService,
  ) {}

  executeNode(
    session: Session,
    player: Player,
    npc: Npc,
    graph: DialogueGraph,
    conversation: NpcConversation,
    node: DialogueNode,
    now: number,
  ): void {
    const action = node.action;
    if (action?.kind === "promote") {
      conversation.pendingAction = true;
      const result = this.promotion?.start(
        session,
        npc,
        action.minimumLevel,
        action.cost,
        now,
        (committedAt) => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          conversation.currentNodeId = node.nextNodeId ?? graph.rootNodeId;
          conversation.expiresAt = committedAt + graph.timeoutMs;
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            node.responses,
            node,
          );
        },
        (failedAt, reason) => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          conversation.currentNodeId = graph.rootNodeId;
          conversation.expiresAt = failedAt + graph.timeoutMs;
          const response = reason === "already-promoted"
            ? "You are already promoted!"
            : reason === "level-too-low"
              ? `I am sorry, but I can only promote you once you have reached level ${action.minimumLevel}.`
              : reason === "insufficient-funds"
                ? "You do not have enough money!"
                : "I cannot promote you right now.";
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            [response],
          );
        },
      ) ?? "unavailable";
      if (result === "started") return;
      conversation.pendingAction = false;
      conversation.currentNodeId = graph.rootNodeId;
      const response = result === "already-promoted"
        ? "You are already promoted!"
        : result === "level-too-low"
          ? `I am sorry, but I can only promote you once you have reached level ${action.minimumLevel}.`
          : result === "busy"
            ? "Please wait until your other action is finished."
            : "I cannot promote you right now.";
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        [response],
      );
      return;
    }
    if (action?.kind === "travel") {
      const offer = graph.travelOffers.find(
        (candidate) => candidate.id === action.offerId,
      );
      if (!offer) return;
      conversation.pendingAction = true;
      const result = this.travel.start(
        session,
        npc,
        offer,
        now,
        () => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            node.responses,
            node,
            false,
          );
          this.flow.close(session, npc, conversation, "travelled");
        },
        (failedAt, reason) => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          conversation.expiresAt = failedAt + graph.timeoutMs;
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            [
              reason === "insufficient-funds"
                ? "You don't have enough money."
                : "I cannot send you there right now.",
            ],
          );
        },
      );
      if (result === "started") return;
      conversation.pendingAction = false;
      const response = result === "level-too-low"
        ? `You must reach level ${offer.minimumLevel ?? 1} before I can let you go there.`
        : result === "pz-locked"
          ? "First get rid of those blood stains!"
          : result === "exhausted"
            ? "You need to wait before travelling again."
            : result === "busy"
              ? "Please wait until your other action is finished."
              : "I cannot send you there right now.";
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        [response],
      );
      return;
    }
    if (action?.kind === "bank") {
      conversation.pendingAction = true;
      const result = this.bank.open(
        session,
        npc,
        () => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          conversation.currentNodeId = node.nextNodeId ?? graph.rootNodeId;
          conversation.expiresAt = now + graph.timeoutMs;
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            node.responses,
            node,
          );
        },
        () => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          conversation.expiresAt = now + graph.timeoutMs;
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            ["The bank is unavailable right now."],
          );
        },
      );
      if (result === "started") return;
      conversation.pendingAction = false;
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        ["The bank is unavailable right now."],
      );
      return;
    }
    if (action?.kind === "shop") {
      const result = this.shops.open(session, npc, action.shopId, now);
      conversation.currentNodeId = node.nextNodeId ?? graph.rootNodeId;
      conversation.expiresAt = now + graph.timeoutMs;
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        result === "opened"
          ? node.responses
          : ["Trade is not available right now."],
        node,
      );
      return;
    }
    conversation.currentNodeId = node.nextNodeId ?? node.id;
    conversation.expiresAt = now + graph.timeoutMs;
    sendNpcDialogueResponses(
      session,
      player,
      npc,
      graph,
      conversation,
      node.responses,
      node,
    );
  }
}
