import type { Npc } from "../creature/Npc";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { FAREWELL_CHOICE_ID } from "./FAREWELL_CHOICE_ID";
import { findDialogueNode } from "./findDialogueNode";
import type { NpcConversation } from "./NpcConversation";
import { renderNpcDialogueText } from "./renderNpcDialogueText";

export function sendNpcDialogueResponses(
  session: Session,
  player: Player,
  npc: Npc,
  graph: DialogueGraph,
  conversation: NpcConversation,
  responses: ReadonlyArray<string>,
  responseNode?: DialogueNode,
  includeOptions = true,
): void {
  const current = findDialogueNode(graph, conversation.currentNodeId);
  const options = includeOptions
    ? [
        ...(current?.choices.map((choice) => {
          const target = findDialogueNode(graph, choice.nodeId);
          return {
            id: choice.nodeId,
            label: choice.label,
            ...(target?.action?.kind === "travel"
              ? { action: "travel" as const }
              : {}),
          };
        }) ?? []),
        { id: FAREWELL_CHOICE_ID, label: "Bye" },
      ]
    : [];
  const travelPrefetchPosition = responseNode?.offerId
    ? graph.travelOffers.find((offer) => offer.id === responseNode.offerId)
        ?.destination
    : undefined;
  responses.forEach((response, index) => {
    session.send({
      type: "npc-dialogue",
      npcId: npc.id,
      npcName: npc.name,
      conversationId: conversation.id,
      position: { ...npc.position },
      text: renderNpcDialogueText(response, player, graph, responseNode),
      options: index === responses.length - 1 ? options : [],
      ...(travelPrefetchPosition
        ? { travelPrefetchPosition: { ...travelPrefetchPosition } }
        : {}),
    });
  });
}
