import { blessingById, costOfBlessing, hasBlessing } from "./blessings";

export interface BlessingPurchasePlan {
  /** The offered blessings the character does not hold yet, in id order. */
  readonly missingIds: ReadonlyArray<number>;
  /** Mask of `missingIds`, ready to OR into the persisted column. */
  readonly grantMask: number;
  /** Total gold for the missing blessings, surcharge applied and floored. */
  readonly price: number;
}

/**
 * Prices a blessing purchase from server-owned state only: the offer's ids
 * come from reviewed dialogue content, the mask and level from the character
 * row. Already-held blessings are skipped and never paid for again, matching
 * Canary's `Blessings.getInquisitionPrice` (which also carries the
 * Inquisition's 10% surcharge on the summed single prices).
 */
export function planBlessingPurchase(
  blessingIds: ReadonlyArray<number>,
  ownedMask: number,
  level: number,
  surchargePercent: number,
): BlessingPurchasePlan {
  if (
    !Number.isInteger(surchargePercent) ||
    surchargePercent < 0 ||
    surchargePercent > 100
  ) {
    throw new Error("blessing surcharge is out of range");
  }
  const missingIds: number[] = [];
  let grantMask = 0;
  let base = 0;
  for (const id of blessingIds) {
    const blessing = blessingById(id);
    if (!blessing) throw new Error(`unknown blessing id ${id}`);
    if (hasBlessing(ownedMask, id)) continue;
    missingIds.push(id);
    grantMask |= 1 << (id - 1);
    base += costOfBlessing(blessing, level);
  }
  return {
    missingIds,
    grantMask,
    price: Math.floor((base * (100 + surchargePercent)) / 100),
  };
}
