import type {
  CombatOrigin,
  DamageType,
  HitBlock,
} from "@tibia/protocol";

export interface DamageRequest {
  readonly sourceId: string | null;
  readonly origin: CombatOrigin;
  readonly type: DamageType;
  readonly minimum: number;
  readonly maximum: number;
  readonly effectId?: number;
  readonly missileId?: number;
  readonly criticalChance?: number;
  readonly criticalDamagePercent?: number;
  readonly lifeLeechChance?: number;
  readonly lifeLeechPercent?: number;
  readonly manaLeechChance?: number;
  readonly manaLeechPercent?: number;
  readonly hitChance?: number;
  readonly ignoreArmor?: boolean;
  readonly ignoreShield?: boolean;
}

export interface DamageResult {
  readonly amount: number;
  readonly block: HitBlock;
  readonly critical: boolean;
  readonly healthChanged: boolean;
  readonly manaChanged: boolean;
}
