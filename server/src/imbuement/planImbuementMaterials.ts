/**
 * Splits an imbuement's astral sources between carried rows and the stash,
 * transcribed from pinned Canary player.cpp:2682-2727 (onApplyImbuement) and
 * :2557-2603 (createScrollImbuement), which share the rule: every source must
 * be covered by carried + stash, and each source is taken from carried first
 * with only the shortfall withdrawn from the stash.
 *
 * Pure on purpose — the caller reserves the stash share synchronously inside
 * the tick and hands these counts to the store transaction, so there is no
 * yield point between "checked" and "spent" (charter rule 3).
 */
export interface ImbuementMaterialPlan {
  /** Destroyed from carried rows inside the store transaction. */
  readonly carried: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  /** Stash draws: how many come out, and the absolute count left behind. */
  readonly stash: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly drawn: number;
    readonly remaining: number;
  }>;
}

export function planImbuementMaterials(input: {
  readonly sources: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  readonly carriedCountOf: (itemTypeId: number) => number;
  readonly stashCountOf: (itemTypeId: number) => number;
}): ImbuementMaterialPlan | null {
  const carried: Array<{ itemTypeId: number; count: number }> = [];
  const stash: Array<{
    itemTypeId: number;
    drawn: number;
    remaining: number;
  }> = [];
  for (const source of input.sources) {
    const carriedCount = input.carriedCountOf(source.itemTypeId);
    const stashCount = input.stashCountOf(source.itemTypeId);
    if (carriedCount + stashCount < source.count) return null;
    if (carriedCount >= source.count) {
      carried.push({ itemTypeId: source.itemTypeId, count: source.count });
      continue;
    }
    const drawn = source.count - carriedCount;
    if (carriedCount > 0) {
      carried.push({ itemTypeId: source.itemTypeId, count: carriedCount });
    }
    stash.push({
      itemTypeId: source.itemTypeId,
      drawn,
      remaining: stashCount - drawn,
    });
  }
  return { carried, stash };
}
