import { randomUUID } from "node:crypto";
import type { NpcDialogueChoiceMessage } from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { matchesNpcDialogueInput } from "./matchesNpcDialogueInput";
import type { NpcConversation } from "./NpcConversation";
import type { TravelService } from "./TravelService";

const MAX_TALK_RANGE = 8;
const FAREWELL_CHOICE_ID = "farewell";

export class NpcHandler {
  private readonly conversations = new Map<string, NpcConversation>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly travel: TravelService,
  ) {}

  handleSpeech(player: Player, text: string, now: number): void {
    const session = this.registry.sessionFor(player.id);
    if (!session) return;
    for (const creature of this.world.creaturesNear(player.position, {
      x: MAX_TALK_RANGE,
      y: MAX_TALK_RANGE,
    })) {
      if (!(creature instanceof Npc) || !creature.type.dialogue) continue;
      if (!session.knownCreatureIds.has(creature.id)) continue;
      if (!this.inRange(player, creature, creature.type.dialogue)) continue;
      const key = this.key(creature.id, player.id);
      const conversation = this.conversations.get(key);
      if (!conversation) {
        if (
          matchesNpcDialogueInput(
            text,
            creature.type.dialogue.greetingKeywords.map((keyword) => [keyword]),
          )
        ) {
          this.greet(session, player, creature, creature.type.dialogue, now);
        }
        continue;
      }
      if (conversation.pendingAction) continue;
      if (
        matchesNpcDialogueInput(
          text,
          creature.type.dialogue.farewellKeywords.map((keyword) => [keyword]),
        )
      ) {
        this.farewell(session, player, creature, conversation);
        continue;
      }
      const node = this.matchNode(
        creature.type.dialogue,
        conversation.currentNodeId,
        text,
      );
      if (node) {
        this.executeNode(
          session,
          player,
          creature,
          creature.type.dialogue,
          conversation,
          node,
          now,
        );
      }
    }
  }

  handleChoice(
    session: Session,
    intent: NpcDialogueChoiceMessage,
    now: number,
  ): void {
    if (!session.playerId) return;
    const player = this.world.getPlayer(session.playerId);
    const creature = this.world.getCreature(intent.npcId);
    if (
      !player ||
      !(creature instanceof Npc) ||
      !creature.type.dialogue ||
      !session.knownCreatureIds.has(creature.id)
    ) {
      return;
    }
    const conversation = this.conversations.get(
      this.key(creature.id, player.id),
    );
    if (
      !conversation ||
      conversation.id !== intent.conversationId ||
      conversation.pendingAction
    ) {
      return;
    }
    if (!this.inRange(player, creature, creature.type.dialogue)) {
      this.walkAway(session, player, creature, conversation);
      return;
    }
    if (now >= conversation.expiresAt) {
      this.close(session, creature, conversation, "timed-out");
      return;
    }
    if (intent.choiceId === FAREWELL_CHOICE_ID) {
      this.farewell(session, player, creature, conversation);
      return;
    }
    const current = this.node(creature.type.dialogue, conversation.currentNodeId);
    const choice = current?.choices.find(
      (candidate) => candidate.nodeId === intent.choiceId,
    );
    if (!choice) return;
    const target = this.node(creature.type.dialogue, choice.nodeId);
    if (!target) return;
    this.executeNode(
      session,
      player,
      creature,
      creature.type.dialogue,
      conversation,
      target,
      now,
    );
  }

  tick(now: number): void {
    for (const conversation of [...this.conversations.values()]) {
      const player = this.world.getPlayer(conversation.playerId);
      const creature = this.world.getCreature(conversation.npcId);
      const session = this.registry.sessionFor(conversation.playerId);
      if (!(creature instanceof Npc) || !creature.type.dialogue) {
        if (session) this.close(session, undefined, conversation, "npc-removed");
        else this.remove(conversation, undefined);
        continue;
      }
      if (!player || !session) {
        this.remove(conversation, creature);
        continue;
      }
      if (!this.inRange(player, creature, creature.type.dialogue)) {
        this.walkAway(session, player, creature, conversation);
        continue;
      }
      if (now >= conversation.expiresAt && !conversation.pendingAction) {
        this.close(session, creature, conversation, "timed-out");
      }
    }
  }

  removePlayer(playerId: string): void {
    for (const conversation of [...this.conversations.values()]) {
      if (conversation.playerId !== playerId) continue;
      const creature = this.world.getCreature(conversation.npcId);
      this.remove(
        conversation,
        creature instanceof Npc ? creature : undefined,
      );
    }
  }

  private greet(
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
    this.conversations.set(this.key(npc.id, player.id), conversation);
    npc.beginConversation(player.id);
    this.visibility.broadcastPose(npc);
    this.sendResponses(session, player, npc, graph, conversation, graph.greeting);
  }

  private farewell(
    session: Session,
    player: Player,
    npc: Npc,
    conversation: NpcConversation,
  ): void {
    const graph = npc.type.dialogue;
    if (!graph) return;
    this.sendResponses(
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

  private walkAway(
    session: Session,
    player: Player,
    npc: Npc,
    conversation: NpcConversation,
  ): void {
    const graph = npc.type.dialogue;
    if (!graph) return;
    this.sendResponses(
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

  private executeNode(
    session: Session,
    player: Player,
    npc: Npc,
    graph: DialogueGraph,
    conversation: NpcConversation,
    node: DialogueNode,
    now: number,
  ): void {
    const action = node.action;
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
          if (!this.isCurrent(conversation)) return;
          this.sendResponses(
            session,
            player,
            npc,
            graph,
            conversation,
            node.responses,
            node,
            false,
          );
          this.close(session, npc, conversation, "travelled");
        },
        (failedAt, reason) => {
          conversation.pendingAction = false;
          if (!this.isCurrent(conversation)) return;
          conversation.expiresAt = failedAt + graph.timeoutMs;
          this.sendResponses(
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
      this.sendResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        [response],
      );
      return;
    }
    if (action?.kind === "shop") {
      conversation.currentNodeId = graph.rootNodeId;
      conversation.expiresAt = now + graph.timeoutMs;
      this.sendResponses(
        session,
        player,
        npc,
        graph,
        conversation,
        ["Trade is not available yet."],
      );
      return;
    }
    conversation.currentNodeId = node.nextNodeId ?? node.id;
    conversation.expiresAt = now + graph.timeoutMs;
    this.sendResponses(
      session,
      player,
      npc,
      graph,
      conversation,
      node.responses,
      node,
    );
  }

  private sendResponses(
    session: Session,
    player: Player,
    npc: Npc,
    graph: DialogueGraph,
    conversation: NpcConversation,
    responses: ReadonlyArray<string>,
    responseNode?: DialogueNode,
    includeOptions = true,
  ): void {
    const current = this.node(graph, conversation.currentNodeId);
    const options = includeOptions
      ? [
          ...(current?.choices.map((choice) => ({
            id: choice.nodeId,
            label: choice.label,
          })) ?? []),
          { id: FAREWELL_CHOICE_ID, label: "Bye" },
        ]
      : [];
    responses.forEach((response, index) => {
      session.send({
        type: "npc-dialogue",
        npcId: npc.id,
        npcName: npc.name,
        conversationId: conversation.id,
        position: { ...npc.position },
        text: this.render(response, player, graph, responseNode),
        options: index === responses.length - 1 ? options : [],
      });
    });
  }

  private render(
    response: string,
    player: Player,
    graph: DialogueGraph,
    node?: DialogueNode,
  ): string {
    const offer = node?.offerId
      ? graph.travelOffers.find((candidate) => candidate.id === node.offerId)
      : undefined;
    return response
      .replaceAll("|PLAYERNAME|", player.name)
      .replaceAll(
        "|TRAVELCOST|",
        offer && offer.cost > 0 ? `${offer.cost} gold` : "free",
      );
  }

  private matchNode(
    graph: DialogueGraph,
    currentNodeId: string,
    text: string,
  ): DialogueNode | undefined {
    const current = this.node(graph, currentNodeId);
    const root = this.node(graph, graph.rootNodeId);
    const candidateIds = [
      ...(current?.children ?? []),
      ...(currentNodeId === graph.rootNodeId ? [] : (root?.children ?? [])),
    ];
    for (const id of new Set(candidateIds)) {
      const candidate = this.node(graph, id);
      if (
        candidate &&
        matchesNpcDialogueInput(text, candidate.matches)
      ) {
        return candidate;
      }
    }
    return undefined;
  }

  private close(
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
    this.remove(conversation, npc);
    session.send({
      type: "npc-dialogue-closed",
      npcId: conversation.npcId,
      conversationId: conversation.id,
      reason,
    });
  }

  private remove(conversation: NpcConversation, npc?: Npc): void {
    const key = this.key(conversation.npcId, conversation.playerId);
    if (this.conversations.get(key) !== conversation) return;
    this.conversations.delete(key);
    npc?.endConversation(conversation.playerId);
  }

  private isCurrent(conversation: NpcConversation): boolean {
    return (
      this.conversations.get(
        this.key(conversation.npcId, conversation.playerId),
      ) === conversation
    );
  }

  private node(
    graph: DialogueGraph,
    nodeId: string,
  ): DialogueNode | undefined {
    return graph.nodes.find((node) => node.id === nodeId);
  }

  private inRange(player: Player, npc: Npc, graph: DialogueGraph): boolean {
    return (
      player.position.z === npc.position.z &&
      Math.max(
        Math.abs(player.position.x - npc.position.x),
        Math.abs(player.position.y - npc.position.y),
      ) <= graph.talkRange
    );
  }

  private key(npcId: string, playerId: string): string {
    return `${npcId}\u0000${playerId}`;
  }
}
