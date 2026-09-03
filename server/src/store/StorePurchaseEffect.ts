import type { CharacterSex } from "@tibia/protocol";
import type { Item } from "../item/Item";

/**
 * What a committed purchase has to change in the *live* world, decided by the
 * transaction that already wrote it durably.
 *
 * The split matters: the database row is the truth, and the tick applies this
 * to memory afterwards. Nothing here is a second decision — every value was
 * computed and persisted inside the purchase transaction, so a tick that
 * never runs (crash, logout) loses no state, and a replayed purchase produces
 * no second effect (charter rules 2 and 3).
 */
export type StorePurchaseEffect =
  | { readonly kind: "premium" }
  | {
      readonly kind: "outfit";
      readonly lookType: number;
      readonly addons: number;
    }
  | { readonly kind: "mount"; readonly mountId: number }
  | { readonly kind: "inbox-item"; readonly item: Item }
  | { readonly kind: "prey-wildcard"; readonly balance: number }
  | { readonly kind: "prey-slot"; readonly slot: number }
  | { readonly kind: "hunting-slot"; readonly slot: number }
  | { readonly kind: "exp-boost"; readonly untilMs: number }
  | {
      readonly kind: "sex-change";
      readonly sex: CharacterSex;
      readonly lookType: number;
    }
  | { readonly kind: "name-change"; readonly displayName: string };
