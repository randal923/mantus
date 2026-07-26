import { forgeMaxTierFor, type InventoryItem, type InventoryState } from "@tibia/protocol";
import { getInventoryItems } from "../inventory/getInventoryItems";
import { itemClassificationOf } from "./itemClassificationOf";

export interface FusionPair {
  /** Stable key for list rendering (typeId:tier). */
  readonly key: string;
  /** Representative item for sprite/name display. */
  readonly item: InventoryItem;
  readonly classification: number;
  readonly tier: number;
  /** How many identical candidates the player carries. */
  readonly count: number;
  readonly firstItemId: string;
  readonly secondItemId: string;
}

/**
 * Groups carried classified items by type and tier and keeps groups with at
 * least two members below the classification's tier cap. Pure candidate
 * derivation for display — the server re-validates both items on fusion.
 */
export function collectFusionPairs(
  inventory: InventoryState,
): ReadonlyArray<FusionPair> {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of getInventoryItems(inventory)) {
    if (item.tier === undefined) continue;
    if (itemClassificationOf(item) <= 0) continue;
    const key = `${item.typeId}:${item.tier}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const pairs: FusionPair[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const [first, second] = items;
    if (!first || !second) continue;
    const classification = itemClassificationOf(first);
    const tier = first.tier ?? 0;
    if (tier + 1 > forgeMaxTierFor(classification)) continue;
    pairs.push({
      key,
      item: first,
      classification,
      tier,
      count: items.length,
      firstItemId: first.id,
      secondItemId: second.id,
    });
  }
  return pairs.sort(
    (left, right) =>
      left.item.name.localeCompare(right.item.name) || left.tier - right.tier,
  );
}
