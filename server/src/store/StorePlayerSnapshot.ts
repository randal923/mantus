import type { CharacterSex } from "@tibia/protocol";

/**
 * The buyer's own state, as the availability check needs it. Everything here
 * is already visible to that player — their wardrobe, their slots, their
 * balances — so shipping the resulting `disabled` flags to them shares
 * nothing new (charter rule 6).
 *
 * It is a *display* input only. The purchase transaction re-reads all of it
 * from the database at execution time, because anything sampled here can be
 * stale by the time the purchase runs (charter rule 4).
 */
export interface StorePlayerSnapshot {
  readonly sex: CharacterSex;
  /** Owned look types mapped to their granted addon bits. */
  readonly outfitAddonsByLookType: ReadonlyMap<number, number>;
  readonly mountIds: ReadonlySet<number>;
  /** Item types the character already carries, for unique-item offers. */
  readonly uniqueItemTypeIds: ReadonlySet<number>;
  readonly wildcards: number;
  /** True once every prey slot is unlocked. */
  readonly preySlotsUnlocked: boolean;
  readonly huntingSlotsUnlocked: boolean;
  readonly xpBoostActive: boolean;
  readonly xpBoostPurchasesToday: number;
  readonly premiumDaysRemaining: number;
}
