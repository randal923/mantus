import type { ItemMutation } from "./ItemMutation";

export interface ConjureItemResult {
  readonly mutation: ItemMutation;
  readonly characterVersion: number;
}
