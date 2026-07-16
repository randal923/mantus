import type {
  ConditionType,
  CreatureOutfit,
  DamageType,
} from "@tibia/protocol";

export interface ConditionApplication {
  readonly type: ConditionType;
  readonly sourceId: string | null;
  readonly durationMs: number;
  readonly magnitude?: number;
  readonly tickIntervalMs?: number;
  readonly damageType?: DamageType;
  readonly effectId?: number;
  readonly outfit?: CreatureOutfit;
  readonly light?: {
    readonly intensity: number;
    readonly color: number;
  };
}

export interface ActiveCondition extends ConditionApplication {
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly stacks: number;
  readonly nextTickAt: number | null;
}

export interface ConditionTick {
  readonly sourceId: string | null;
  readonly type: ConditionType;
  readonly damageType: DamageType;
  readonly amount: number;
  readonly effectId?: number;
}
