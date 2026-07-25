import type { Account } from "../AccountStore";
import type { Player } from "../Player";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { travelFareFor } from "./travelFareFor";

export function renderNpcDialogueText(
  response: string,
  player: Player,
  graph: DialogueGraph,
  node?: DialogueNode,
  account: Account | null = null,
  now = 0,
): string {
  const offer = node?.offerId
    ? graph.travelOffers.find((candidate) => candidate.id === node.offerId)
    : undefined;
  // Quoted at the discounted rate the confirmation will actually charge; the
  // fare is recomputed there, so a quote can never become the price.
  const fare = offer ? travelFareFor(offer, player, account, now) : 0;
  return response
    .replaceAll("|PLAYERNAME|", player.name)
    .replaceAll("|TRAVELCOST|", offer && fare > 0 ? `${fare} gold` : "free");
}
