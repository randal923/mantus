import type { ItemMutation } from "../item/ItemMutation";

export type NpcTravelCommitResult =
  | {
      readonly status: "committed";
      readonly characterVersion: number;
      readonly mutation: ItemMutation;
    }
  | { readonly status: "insufficient-funds" };
