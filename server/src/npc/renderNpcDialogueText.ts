import type { Account } from "../AccountStore";
import type { Player } from "../Player";
import { planBlessingPurchase } from "../progression/planBlessingPurchase";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { findBlessAction } from "./findBlessAction";
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
  let rendered = response
    .replaceAll("|PLAYERNAME|", player.name)
    .replaceAll("|TRAVELCOST|", offer && fare > 0 ? `${fare} gold` : "free");
  if (rendered.includes("|BLESSCOST|")) {
    // Quoted from the player's own level and mask; the purchase recomputes
    // the same plan from database truth, so a quote can never become the
    // price (charter rule 4).
    const bless = node ? findBlessAction(graph, node) : undefined;
    const price = bless
      ? planBlessingPurchase(
          bless.blessingIds,
          player.blessingsMask,
          player.level,
          bless.surchargePercent,
        ).price
      : 0;
    rendered = rendered.replaceAll("|BLESSCOST|", `${price} gold`);
  }
  return rendered;
}
