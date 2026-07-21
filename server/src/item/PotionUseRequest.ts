import type { PotionItemPlan } from "./PotionItemPlan";

export interface PotionUseRequest {
  readonly actorCharacterId: string;
  readonly targetCharacterId: string;
  readonly itemPlan: PotionItemPlan;
  readonly expectedTargetCharacterVersion: number;
  readonly expectedTargetHealth: number;
  readonly expectedTargetMana: number;
  readonly targetMaxHealth: number;
  readonly targetMaxMana: number;
  readonly healthRestore: number;
  readonly manaRestore: number;
}
