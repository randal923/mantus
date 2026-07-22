import type { CharacterVocation } from "@tibia/protocol";
import type { ItemMutation } from "../item/ItemMutation";

export type PromotionCommitResult =
  | {
      readonly status: "committed";
      readonly characterVersion: number;
      readonly vocation: CharacterVocation;
      readonly mutation: ItemMutation;
    }
  | { readonly status: "already-promoted" }
  | { readonly status: "level-too-low" }
  | { readonly status: "insufficient-funds" };

export interface PromotionStore {
  commit(
    characterId: string,
    expectedCharacterVersion: number,
    minimumLevel: number,
    cost: number,
    npcTypeId: string,
  ): Promise<PromotionCommitResult>;
}
