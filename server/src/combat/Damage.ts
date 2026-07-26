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
  /**
   * How many creatures this cast struck; leech is split across them with
   * Canary's (0.1 * n + 0.9) / n falloff. Defaults to 1.
   */
  readonly leechTargets?: number;
  /** Wheel augment percent on the post-block damage (Canary damageMultiplier). */
  readonly wheelDamagePercent?: number;
  /** Wheel augment percent on healing (Canary healingMultiplier). */
  readonly wheelHealingPercent?: number;
  /** Always-on per-spell leech from wheel augments, in percent. */
  readonly wheelLifeLeechPercent?: number;
  readonly wheelManaLeechPercent?: number;
  /** Healing Link: the caster self-heals this percent of a linked heal. */
  readonly healingLinkPercent?: number;
  readonly hitChance?: number;
  readonly ignoreArmor?: boolean;
  readonly ignoreShield?: boolean;
  readonly allowReflection?: boolean;
}

export interface DamageResult {
  readonly amount: number;
  readonly block: HitBlock;
  readonly critical: boolean;
  readonly healthChanged: boolean;
  readonly manaChanged: boolean;
}
