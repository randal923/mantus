import type {
  CharacterVocation,
  DailyRewardKind,
  DailyRewardPick,
} from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { DailyClaimItemGrant } from "./DailyRewardStore";
import {
  dailyRewardPoolFor,
  EXERCISE_WEAPON_POOL,
} from "./dailyRewardPools";

/**
 * Resolves client item choices into trusted catalog grants. The caller still
 * re-checks capacity and commits the resulting items atomically.
 */
export function validateDailyRewardPicks(
  catalog: ItemCatalog,
  vocation: CharacterVocation,
  kind: DailyRewardKind,
  picks: ReadonlyArray<DailyRewardPick>,
  allowance: number,
): ReadonlyArray<DailyClaimItemGrant> | null {
  if (kind === "wildcards" || kind === "xp-boost") {
    return picks.length === 0 ? [] : null;
  }

  const poolIds = new Set(
    kind === "training-items"
      ? EXERCISE_WEAPON_POOL
      : dailyRewardPoolFor(vocation),
  );
  if (picks.length === 0) return null;
  if (kind === "training-items" && picks.length !== 1) return null;

  const seen = new Set<number>();
  const items: DailyClaimItemGrant[] = [];
  let units = 0;
  for (const pick of picks) {
    if (!poolIds.has(pick.itemTypeId) || seen.has(pick.itemTypeId)) return null;
    seen.add(pick.itemTypeId);
    const type = catalog.get(pick.itemTypeId);
    if (!type || !type.pickupable) return null;
    units += pick.count;
    if (units > allowance) return null;
    items.push({
      typeId: pick.itemTypeId,
      count: pick.count,
      stackable: type.stackable,
      maxCount: Math.max(1, type.maxCount),
    });
  }

  return units === allowance ? items : null;
}
