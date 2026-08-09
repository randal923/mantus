import type { CharacterSex } from "@tibia/protocol";
import type { Item } from "../item/Item";

/**
 * The systems a committed purchase has to nudge, narrowed to exactly what the
 * store needs. Every method is refresh-only: the purchase transaction already
 * wrote the durable truth, so nothing here decides anything, and a hook that
 * never fires (the player logged out mid-purchase) loses no state — the next
 * login loads it from the database (charter rules 2 and 3).
 */
export interface StoreLiveHooks {
  /** Owned outfits and mounts, for greying out what is already owned. */
  entitlementsFor(characterId: string): {
    outfits: ReadonlyArray<{ lookType: number; addons: number }>;
    mounts: ReadonlyArray<{ mountId: number }>;
  };
  /** Re-reads outfit/mount entitlements after a committed grant. */
  refreshOutfits(characterId: string): void;
  wildcardsOf(characterId: string): number;
  applyWildcardBalance(characterId: string, balance: number): void;
  /** True once the character has no locked prey / hunting task slots left. */
  preySlotsUnlocked(characterId: string): boolean;
  huntingSlotsUnlocked(characterId: string): boolean;
  applyPreySlotUnlock(characterId: string, slot: number): void;
  applyHuntingSlotUnlock(characterId: string, slot: number): void;
  xpBoostUntilMs(characterId: string): number;
  applyXpBoost(characterId: string, untilMs: number, nowMs: number): void;
  /**
   * Puts a delivered product into the buyer's live caches: bound-container
   * deliveries (container-located rows) land in the carried inventory,
   * anything else in the depot inbox cache.
   */
  injectDelivery(characterId: string, item: Item, nowMs: number): void;
  /** Applies a committed sex change to the live creature. */
  applySexChange(characterId: string, sex: CharacterSex, lookType: number): void;
  /** Canary's temple teleport; refused while the player is fighting. */
  canTempleTeleport(characterId: string): boolean;
  templeTeleport(characterId: string): void;
}
