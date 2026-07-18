import type { Player } from "../Player";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";

export function renderNpcDialogueText(
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
