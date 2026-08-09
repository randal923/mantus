import type { ItemMutation } from "../item/ItemMutation";

export type BlessCommitResult =
  | {
      readonly status: "committed";
      readonly characterVersion: number;
      /** The blessings actually granted (already-held ones are excluded). */
      readonly grantedMask: number;
      /** The price actually charged, from database truth. */
      readonly price: number;
      readonly mutation: ItemMutation;
    }
  | { readonly status: "already-blessed" }
  | { readonly status: "insufficient-funds" };

/**
 * Durable blessing purchases. One transaction re-reads level and mask under a
 * row lock, prices the missing blessings, takes the money (carried coins
 * first, then the bank), ORs the mask, bumps the character version, and
 * appends the audit row — a blessing that was paid for but not granted, or
 * granted without a trail, cannot exist (charter rules 2/11).
 */
export interface BlessStore {
  commit(
    characterId: string,
    expectedCharacterVersion: number,
    blessingIds: ReadonlyArray<number>,
    surchargePercent: number,
    npcTypeId: string,
  ): Promise<BlessCommitResult>;
}
