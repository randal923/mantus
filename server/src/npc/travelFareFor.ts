import type { Account } from "../AccountStore";
import type { Player } from "../Player";
import type { NpcTravelOffer } from "./DialogueGraph";
import { evaluateDialogueConditions } from "./evaluateDialogueConditions";

/**
 * The fare this player owes for this route, right now. Discounts are pure
 * server state (quest storage, level, premium) resolved at confirmation
 * execution time — the client never sends, and is never asked for, a price.
 * The first matching entry wins, so content orders them best-first.
 */
export function travelFareFor(
  offer: NpcTravelOffer,
  player: Player,
  account: Account | null,
  now: number,
): number {
  for (const discount of offer.discounts ?? []) {
    if (
      evaluateDialogueConditions(discount.conditions, player, account, now)
    ) {
      return Math.min(discount.cost, offer.cost);
    }
  }
  return offer.cost;
}
