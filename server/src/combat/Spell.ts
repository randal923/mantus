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
}
