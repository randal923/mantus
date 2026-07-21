import type { ItemMutation } from "./ItemMutation";

export interface PotionUseResult {
  readonly mutation: ItemMutation;
  readonly targetCharacterVersion: number;
  readonly healthRestored: number;
  readonly manaRestored: number;
}
