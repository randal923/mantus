import type { Npc } from "../creature/Npc";
import type { BankService } from "../economy/BankService";
import type { ShopService } from "../economy/ShopService";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { evaluateDialogueConditions } from "./evaluateDialogueConditions";
import type { NpcConversation } from "./NpcConversation";
import type { NpcConversations } from "./NpcConversations";
import type { NpcDialogueFlow } from "./NpcDialogueFlow";
import { sendNpcDialogueResponses } from "./sendNpcDialogueResponses";
import type { SpellTeacherService } from "./SpellTeacherService";
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
    private readonly spellTeacher?: SpellTeacherService,
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
    // Every branch requirement is re-evaluated here, at execution time, from
    // live state — the choice may have been offered a minute ago under
    // conditions that no longer hold (charter rule 4).
    if (
      !evaluateDialogueConditions(
        node.conditions,
        player,
        session.account,
        now,
      )
    ) {
      conversation.pendingAction = false;
      conversation.currentNodeId = graph.rootNodeId;
      conversation.expiresAt = now + graph.timeoutMs;
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        ["I cannot help you with that right now."],
      );
      return;
    }
    if (action?.kind === "learn-spell") {
      conversation.pendingAction = true;
      const result = this.spellTeacher?.start(
        session,
        npc,
        action.spellId,
        action.minimumLevel,
        action.price,
        action.premium,
        now,
        (committedAt) => {
          conversation.pendingAction = false;
          if (!this.conversations.isCurrent(conversation)) return;
          this.applyEffects(player, node);
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
          sendNpcDialogueResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            [learnSpellFailureText(reason, action.minimumLevel, action.price)],
          );
        },
      ) ?? "unavailable";
      if (result === "started") return;
      conversation.pendingAction = false;
      conversation.currentNodeId = graph.rootNodeId;
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        [learnSpellFailureText(result, action.minimumLevel, action.price)],
      );
      return;
    }
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
    if (action?.kind === "travel" || action?.kind === "teleport") {
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
          this.applyEffects(player, node);
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
    if (action?.kind === "hint") {
      // Canary rookgaardHints: say the line the player's counter points at,
      // then advance it, wrapping at the end. The counter is server state,
      // read and written inside the tick.
      const index = Math.max(0, player.storageValue(action.storageKey));
      const hint = action.hints[Math.min(index, action.hints.length - 1)];
      player.setStorageValue(
        action.storageKey,
        index + 1 >= action.hints.length ? 0 : index + 1,
      );
      this.applyEffects(player, node);
      conversation.currentNodeId = node.nextNodeId ?? graph.rootNodeId;
      conversation.expiresAt = now + graph.timeoutMs;
      sendNpcDialogueResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        hint ?? node.responses,
        node,
      );
      return;
    }
    this.applyEffects(player, node);
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
      !node.ungreet,
    );
    // Canary `ungreet`: the line is delivered, then the NPC drops focus.
    if (node.ungreet) this.flow.close(session, npc, conversation, "farewell");
  }

  /** State a branch writes once its action (if any) has committed. */
  private applyEffects(player: Player, node: DialogueNode): void {
    for (const effect of node.effects ?? []) {
      player.setStorageValue(effect.key, effect.value);
    }
  }
}

function learnSpellFailureText(
  reason: string,
  minimumLevel: number,
  price: number,
): string {
  if (reason === "already-known") return "You already know this spell.";
  if (reason === "level-too-low") {
    return `You need to be level ${minimumLevel} to learn this spell.`;
  }
  if (reason === "insufficient-funds") {
    return `You do not have enough money, this spell costs ${price} gold.`;
  }
  if (reason === "premium-required") {
    return "You need a premium account in order to buy this spell.";
  }
  if (reason === "busy") return "Please wait until your other action is finished.";
  return "I cannot teach you that right now.";
}
