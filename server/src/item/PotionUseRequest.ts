export interface PotionUseRequest {
  readonly actorCharacterId: string;
  readonly targetCharacterId: string;
  readonly itemId: string;
  readonly expectedItemVersion: number;
  readonly expectedTargetCharacterVersion: number;
  readonly expectedTargetHealth: number;
  readonly expectedTargetMana: number;
  readonly targetMaxHealth: number;
  readonly targetMaxMana: number;
  readonly healthRestore: number;
  readonly manaRestore: number;
}
