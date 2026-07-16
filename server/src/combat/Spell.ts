import type {
  AreaShape,
  CharacterVocation,
  CombatOrigin,
  ConditionType,
  DamageType,
} from "@tibia/protocol";

export type SpellExpression =
  | {
      readonly type: "number";
      readonly value: number;
    }
  | {
      readonly type: "variable";
      readonly name: "level" | "magicLevel" | "skill" | "attack";
    }
  | {
      readonly type: "binary";
      readonly operator: "add" | "subtract" | "multiply" | "divide";
      readonly left: SpellExpression;
      readonly right: SpellExpression;
    };

export interface SpellFormula {
  readonly kind: "fixed" | "level-magic" | "skill";
  readonly minimum: SpellExpression;
  readonly maximum: SpellExpression;
}

export interface SpellCondition {
  readonly type: ConditionType;
  readonly durationMs: number;
  readonly magnitude?: number;
  readonly tickIntervalMs?: number;
  readonly tickAmounts?: ReadonlyArray<number>;
  readonly damageType?: DamageType;
  readonly light?: {
    readonly intensity: number;
    readonly color: number;
  };
  readonly speedFormula?: {
    readonly coefficient: number;
    readonly base: number;
  };
  readonly speedTarget?: number;
  readonly magicShieldFormula?: {
    readonly base: number;
    readonly level: number;
    readonly magicLevel: number;
  };
}

export interface SpellDefinition {
  readonly id: string;
  readonly numericId: number | null;
  readonly sourcePath: string;
  readonly name: string;
  readonly words: string | null;
  readonly origin: Extract<CombatOrigin, "spell" | "rune">;
  readonly runeItemTypeId: number | null;
  readonly charges: number | null;
  readonly vocations: ReadonlyArray<CharacterVocation>;
  readonly requiredLevel: number;
  readonly requiredMagicLevel: number;
  readonly manaCost: number;
  readonly soulCost: number;
  readonly groups: ReadonlyArray<string>;
  readonly cooldownMs: number;
  readonly groupCooldownMs: ReadonlyArray<number>;
  readonly range: number;
  readonly lineOfSight: boolean;
  readonly targetKind:
    | "self"
    | "target"
    | "target-or-direction"
    | "direction"
    | "position";
  readonly aggressive: boolean;
  readonly needWeapon: boolean;
  readonly damageType: DamageType;
  readonly formula: SpellFormula;
  readonly effectId: number;
  readonly missileId: number | null;
  readonly blockArmor: boolean;
  readonly blockShield: boolean;
  readonly area: {
    readonly shape: AreaShape;
    readonly radius?: number;
    readonly length?: number;
    readonly spread?: number;
    readonly offsets?: ReadonlyArray<{
      readonly x: number;
      readonly y: number;
    }>;
    readonly directional?: boolean;
  };
  readonly dispel: ConditionType | null;
  readonly condition: SpellCondition | null;
  readonly casterEffectId: number;
  readonly conjure: {
    readonly sourceItemTypeId: number;
    readonly targetItemTypeId: number;
    readonly count: number;
  } | null;
  readonly castRules: {
    readonly targetPlayerOnly: boolean;
    readonly allowSelf: boolean;
    readonly excludedVocations: ReadonlyArray<CharacterVocation>;
    readonly casterEffectId: number;
  } | null;
}
