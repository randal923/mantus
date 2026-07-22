import type { Item } from "../item/Item";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import { tradeOfferSubtree } from "./tradeOfferSubtree";

/**
 * Moves one offered carried item onto the character's trade-reservation slot.
 * The nested contents stay keyed to the root, so the whole offer leaves the
 * reachable inventory in one mutation and every other move path rejects it
 * structurally (ancestry checks root at equipment/inventory). The returned
 * snapshot (root first) is what the trade session holds until commit or
 * restore.
 */
export function planTradeReservation(input: {
  readonly characterId: string;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
}): { plan: CarriedPlan; snapshot: ReadonlyArray<Item> } | null {
  const item = input.items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  if (
    item.location.kind !== "container" &&
    item.location.kind !== "equipment"
  ) {
    return null;
  }
  const reserved: Item = {
    ...item,
    location: {
      kind: "trade-reservation",
      characterId: input.characterId,
      slot: 0,
    },
    version: item.version + 1,
  };
  const descendants = tradeOfferSubtree(input.items, item.id)
    .slice(1)
    .map((entry) => entry.item);
  return {
    plan: {
      mutation: { before: item, after: [reserved] },
      persist: {
        characterId: input.characterId,
        rowOps: [
          { kind: "write", expectedVersion: item.version, item: reserved },
        ],
        audits: [
          {
            kind: "transfer",
            itemId: item.id,
            from: item.location,
            to: reserved.location,
            count: reserved.count,
          },
        ],
      },
    },
    snapshot: [reserved, ...descendants],
  };
}
