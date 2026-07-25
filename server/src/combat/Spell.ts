import type {
  AreaShape,
  CharacterVocation,
  CombatOrigin,
  ConditionType,
  DamageType,
  WheelDomain,
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
  /** Canary target callbacks that refuse players outright (crippling spells). */
  readonly monstersOnly?: boolean;
  readonly meleePercent?: number;
  readonly distancePercent?: number;
  readonly defensePercent?: number;
  readonly fistPercent?: number;
  readonly damageDealtPercent?: number;
  readonly damageReceivedPercent?: number;
  readonly healingDealtPercent?: number;
  readonly disablesDefense?: boolean;
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
    readonly diagonalOffsets?: ReadonlyArray<{
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
    readonly targetPartyMemberOnly?: boolean;
    readonly allowSelf: boolean;
    readonly excludedVocations: ReadonlyArray<CharacterVocation>;
    readonly casterEffectId: number;
  } | null;
  /** Floor-moving support spells resolved by the movement rules, not combat. */
  readonly worldAction: "magic-rope" | "levitate" | null;
  /**
   * Canary's `revelationStageWOD` gate: the spell only exists for a character
   * that reached the given Wheel of Destiny revelation stage in a domain.
   * Enforced server-side at cast time, like every other requirement.
   */
  readonly wheelRevelation: {
    readonly domain: WheelDomain;
    readonly minimumStage: number;
  } | null;
  /**
   * Player spells whose Canary Lua body is a reviewed TypeScript callback.
   * The regular cast pipeline still owns vocation, level, mana, soul, range,
   * and cooldowns; only the effect is procedural.
   */
  readonly playerAction: PlayerSpellAction | null;
}

export const PLAYER_SPELL_ACTIONS = [
  "conjure-random-food",
  "creature-illusion",
  "challenge",
  "chivalrous-challenge",
  "divine-dazzle",
  "summon-creature",
  "mentor-other",
  "balanced-brawl",
] as const;

export type PlayerSpellAction = (typeof PLAYER_SPELL_ACTIONS)[number];
