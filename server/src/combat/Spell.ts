import type {
  AreaShape,
  CharacterVocation,
  CombatOrigin,
  CombatTarget,
  ConditionType,
  DamageType,
} from "@tibia/protocol";

export interface SpellFormula {
  readonly minimumBase: number;
  readonly maximumBase: number;
  readonly levelFactor: number;
  readonly magicFactor: number;
}

export interface SpellCondition {
  readonly type: ConditionType;
  readonly durationMs: number;
  readonly magnitude?: number;
  readonly tickIntervalMs?: number;
  readonly damageType?: DamageType;
  readonly effectId?: number;
  readonly light?: {
    readonly intensity: number;
    readonly color: number;
  };
}

export interface SpellDefinition {
  readonly id: string;
  readonly name: string;
  readonly origin: Extract<CombatOrigin, "spell" | "rune">;
  readonly runeItemTypeId?: number;
  readonly vocations: ReadonlyArray<CharacterVocation>;
  readonly requiredLevel: number;
  readonly requiredMagicLevel: number;
  readonly manaCost: number;
  readonly soulCost: number;
  readonly cooldownGroup: string;
  readonly cooldownMs: number;
  readonly range: number;
  readonly lineOfSight: boolean;
  readonly targetKinds: ReadonlyArray<CombatTarget["kind"]>;
  readonly area: {
    readonly shape: AreaShape;
    readonly radius?: number;
    readonly length?: number;
    readonly spread?: number;
  };
  readonly damageType: DamageType;
  readonly formula: SpellFormula;
  readonly effectId: number;
  readonly missileId?: number;
  readonly condition?: SpellCondition;
}
