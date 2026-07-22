import type { NpcDialogueChoiceMessage } from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { BankService } from "../economy/BankService";
import type { ShopService } from "../economy/ShopService";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { FAREWELL_CHOICE_ID } from "./FAREWELL_CHOICE_ID";
import { findDialogueNode } from "./findDialogueNode";
import { isInNpcTalkRange } from "./isInNpcTalkRange";
import { matchesNpcDialogueInput } from "./matchesNpcDialogueInput";
import { matchNpcDialogueNode } from "./matchNpcDialogueNode";
import { NpcConversations } from "./NpcConversations";
import { NpcDialogueExecutor } from "./NpcDialogueExecutor";
import { NpcDialogueFlow } from "./NpcDialogueFlow";
import type { TravelService } from "./TravelService";
import type { PromotionService } from "./PromotionService";

const MAX_TALK_RANGE = 8;

export class NpcHandler {
  private readonly conversations = new NpcConversations();
  private readonly flow: NpcDialogueFlow;
  private readonly executor: NpcDialogueExecutor;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    visibility: Visibility,
    travel: TravelService,
    bank: BankService,
    private readonly shops: ShopService,
    promotion?: PromotionService,
  ) {
    this.flow = new NpcDialogueFlow(this.conversations, visibility, shops);
    this.executor = new NpcDialogueExecutor(
      this.conversations,
      this.flow,
      travel,
      bank,
      shops,
      promotion,
    );
  }

  handleSpeech(player: Player, text: string, now: number): void {
    const session = this.registry.sessionFor(player.id);
    if (!session) return;
    for (const creature of this.world.creaturesNear(player.position, {
      x: MAX_TALK_RANGE,
      y: MAX_TALK_RANGE,
    })) {
      if (!(creature instanceof Npc) || !creature.type.dialogue) continue;
      if (!session.knownCreatureIds.has(creature.id)) continue;
      if (!isInNpcTalkRange(player, creature, creature.type.dialogue)) continue;
      const conversation = this.conversations.get(creature.id, player.id);
      if (!conversation) {
        if (
          matchesNpcDialogueInput(
            text,
            creature.type.dialogue.greetingKeywords.map((keyword) => [keyword]),
          )
        ) {
          this.flow.greet(session, player, creature, creature.type.dialogue, now);
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
        this.flow.farewell(session, player, creature, conversation);
        continue;
      }
      const node = matchNpcDialogueNode(
        creature.type.dialogue,
        conversation.currentNodeId,
        text,
      );
      if (node) {
        this.executor.executeNode(
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
    const conversation = this.conversations.get(creature.id, player.id);
    if (
      !conversation ||
      conversation.id !== intent.conversationId ||
      conversation.pendingAction
    ) {
      return;
    }
    if (!isInNpcTalkRange(player, creature, creature.type.dialogue)) {
      this.flow.walkAway(session, player, creature, conversation);
      return;
    }
    if (now >= conversation.expiresAt) {
      this.flow.close(session, creature, conversation, "timed-out");
      return;
    }
    if (intent.choiceId === FAREWELL_CHOICE_ID) {
      this.flow.farewell(session, player, creature, conversation);
      return;
    }
    const current = findDialogueNode(
      creature.type.dialogue,
      conversation.currentNodeId,
    );
    const choice = current?.choices.find(
      (candidate) => candidate.nodeId === intent.choiceId,
    );
    if (!choice) return;
    const target = findDialogueNode(creature.type.dialogue, choice.nodeId);
    if (!target) return;
    this.executor.executeNode(
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
    for (const conversation of this.conversations.values()) {
      const player = this.world.getPlayer(conversation.playerId);
      const creature = this.world.getCreature(conversation.npcId);
      const session = this.registry.sessionFor(conversation.playerId);
      if (!(creature instanceof Npc) || !creature.type.dialogue) {
        if (session) {
          this.flow.close(session, undefined, conversation, "npc-removed");
        } else {
          this.conversations.remove(conversation, undefined);
        }
        continue;
      }
      if (!player || !session) {
        if (session) this.shops.close(session, conversation.npcId);
        this.conversations.remove(conversation, creature);
        continue;
      }
      if (!isInNpcTalkRange(player, creature, creature.type.dialogue)) {
        this.flow.walkAway(session, player, creature, conversation);
        continue;
      }
      if (now >= conversation.expiresAt && !conversation.pendingAction) {
        this.flow.close(session, creature, conversation, "timed-out");
      }
    }
  }

  removePlayer(playerId: string): void {
    const session = this.registry.sessionFor(playerId);
    for (const conversation of this.conversations.values()) {
      if (conversation.playerId !== playerId) continue;
      if (session) this.shops.close(session, conversation.npcId);
      const creature = this.world.getCreature(conversation.npcId);
      this.conversations.remove(
        conversation,
        creature instanceof Npc ? creature : undefined,
      );
    }
  }
}
