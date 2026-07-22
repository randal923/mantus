import type {
  AreaShape,
  ConditionType,
  CreatureOutfit,
  DamageType,
} from "@tibia/protocol";

export interface MonsterAbility {
  readonly kind: "stats" | "damage" | "healing" | "condition" | "effect";
  readonly intervalMs: number;
  readonly chance: number;
  readonly target: "self" | "target" | "direction";
  readonly range: number;
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
  readonly damageType?: DamageType;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defense?: number;
  readonly armor?: number;
  readonly mitigation?: number;
  readonly effect?: string | number;
  readonly missile?: string | number;
  readonly conditionType?: ConditionType;
  readonly durationMs?: number;
  readonly magnitude?: number;
  readonly tickIntervalMs?: number;
  readonly outfitMonsterId?: string;
  readonly outfitItemTypeId?: number;
  readonly conditions?: ReadonlyArray<{
    readonly type: ConditionType;
    readonly durationMs: number;
    readonly speedPercentMinimum?: number;
    readonly speedPercentMaximum?: number;
    readonly attributes?: {
      readonly meleePercent?: { readonly minimum: number; readonly maximum: number };
      readonly distancePercent?: { readonly minimum: number; readonly maximum: number };
      readonly defensePercent?: { readonly minimum: number; readonly maximum: number };
      readonly magicLevelPercent?: { readonly minimum: number; readonly maximum: number };
      readonly magicLevelDelta?: { readonly minimum: number; readonly maximum: number };
    };
    readonly tickDamage?: {
      readonly damageType: DamageType;
      readonly intervalMs: number;
      readonly count: number;
      readonly minimum: number;
      readonly maximum: number;
      readonly multiplier: number;
    };
    /**
     * Precomputed Canary ConditionDamage series (on-hit poison/fire): the
     * exact per-tick amounts, applied at intervalMs, strongest first.
     */
    readonly tickSchedule?: {
      readonly damageType: DamageType;
      readonly intervalMs: number;
      readonly amounts: ReadonlyArray<number>;
    };
  }>;
  readonly dispel?: ConditionType;
  readonly chain?: {
    readonly additionalTargets: number;
    readonly range: number;
    readonly backtracking: boolean;
    readonly effect?: string | number;
    readonly playersOnly: boolean;
  };
  readonly phases?: ReadonlyArray<{
    readonly delayMs: number;
    readonly area?: MonsterAbility["area"];
  }>;
  readonly pathEffect?: string | number;
  readonly field?: { readonly type: "energy" | "fire" | "poison" };
  readonly summon?: { readonly typeId: string; readonly maxCount: number };
  readonly destroyMagicWalls?: boolean;
  readonly questAction?: "spider-queen-wrap";
  readonly targetRule?:
    | {
        readonly kind: "players-damage-monsters-heal";
        readonly damageType: DamageType;
        readonly minimum: number;
        readonly maximum: number;
      }
    | {
        readonly kind: "monsters-only-heal";
        readonly damageType: "healing";
        readonly minimum: number;
        readonly maximum: number;
      }
    | {
        readonly kind: "named-monsters";
        readonly names: ReadonlyArray<string>;
        readonly excludeSameName?: boolean;
        readonly includeCaster?: boolean;
        readonly damageType: DamageType;
        readonly minimum: number;
        readonly maximum: number;
      };
}

export interface MonsterSummon {
  readonly typeId: string;
  readonly intervalMs: number;
  readonly chance: number;
  readonly maxCount: number;
}

export interface MonsterLoot {
  readonly itemTypeId?: number;
  readonly itemName?: string;
  readonly chance: number;
  readonly maxCount: number;
}

export interface MonsterType {
  id: string;
  name: string;
  description: string;
  outfit: CreatureOutfit;
  health: number;
  maxHealth: number;
  speed: number;
  manaCost: number;
  changeTarget: {
    intervalMs: number;
    chance: number;
  };
  light: {
    intensity: number;
    color: number;
  };
  experience: number;
  corpseItemTypeId: number;
  flags: {
    attackable: boolean;
    hostile: boolean;
    pushable: boolean;
    summonable: boolean;
    convinceable: boolean;
    illusionable: boolean;
    canPushItems: boolean;
    canPushCreatures: boolean;
    targetDistance: number;
    runHealth: number;
    staticAttackChance: number;
    healthHidden: boolean;
    canWalkOnEnergy: boolean;
    canWalkOnFire: boolean;
    canWalkOnPoison: boolean;
    isBlockable: boolean;
  };
  race: string;
  faction: string;
  enemyFactions: ReadonlyArray<string>;
  targetStrategy: {
    nearest: number;
    health: number;
    damage: number;
    random: number;
  };
  attacks: ReadonlyArray<MonsterAbility>;
  defenses: ReadonlyArray<MonsterAbility>;
  elements: Readonly<Partial<Record<DamageType, number>>>;
  immunities: ReadonlyArray<ConditionType>;
  reflects: Readonly<Partial<Record<DamageType, number>>>;
  heals: Readonly<Partial<Record<DamageType, number>>>;
  events: ReadonlyArray<string>;
  callbacks: ReadonlyArray<"onSpawn" | "onThink" | "onPlayerAttack">;
  maxSummons: number;
  summons: ReadonlyArray<MonsterSummon>;
  voices: ReadonlyArray<{
    readonly intervalMs: number;
    readonly chance: number;
    readonly text: string;
    readonly yell: boolean;
  }>;
  loot: ReadonlyArray<MonsterLoot>;
}
