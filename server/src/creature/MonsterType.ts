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
  readonly target: "self" | "target";
  readonly range: number;
  readonly area: {
    readonly shape: AreaShape;
    readonly radius?: number;
    readonly length?: number;
    readonly spread?: number;
  };
  readonly damageType?: DamageType;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly defense?: number;
  readonly armor?: number;
  readonly mitigation?: number;
  readonly effect?: string | number;
  readonly missile?: string;
  readonly conditionType?: ConditionType;
  readonly durationMs?: number;
  readonly magnitude?: number;
  readonly tickIntervalMs?: number;
  readonly outfitMonsterId?: string;
  readonly outfitItemTypeId?: number;
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
  };
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
  summons: ReadonlyArray<MonsterSummon>;
  voices: ReadonlyArray<Readonly<Record<string, string | number | boolean>>>;
  loot: ReadonlyArray<MonsterLoot>;
}
