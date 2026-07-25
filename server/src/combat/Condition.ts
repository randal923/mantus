import type {
  ConditionType,
  CreatureOutfit,
  DamageType,
  Position,
} from "@tibia/protocol";

export interface ConditionApplication {
  readonly type: ConditionType;
  readonly sourceId: string | null;
  readonly durationMs: number;
  readonly magnitude?: number;
  readonly tickAmounts?: ReadonlyArray<number>;
  readonly tickIntervalMs?: number;
  readonly damageType?: DamageType;
  readonly effectId?: number;
  readonly outfit?: CreatureOutfit;
  readonly light?: {
    readonly intensity: number;
    readonly color: number;
  };
  readonly capacity?: number;
  readonly naturalRegeneration?: boolean;
  readonly attributes?: Readonly<Partial<Record<
    | "meleePercent"
    | "distancePercent"
    | "defensePercent"
    | "fistPercent"
    | "magicLevelPercent"
    | "magicLevelDelta"
    /** Outgoing damage scale, Canary CONDITION_PARAM_BUFF_DAMAGEDEALT. */
    | "damageDealtPercent"
    /** Incoming damage scale, Canary CONDITION_PARAM_BUFF_DAMAGERECEIVED. */
    | "damageReceivedPercent"
    /** Outgoing healing scale, Canary CONDITION_PARAM_BUFF_HEALINGDEALT. */
    | "healingDealtPercent",
    number
  >>>;
  /** Canary CONDITION_PARAM_DISABLE_DEFENSE: no shield/armor block while up. */
  readonly disablesDefense?: boolean;
  readonly fearSource?: Position;
}

export interface ActiveCondition extends ConditionApplication {
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly stacks: number;
  readonly nextTickAt: number | null;
  readonly nextTickIndex: number;
}

export interface ConditionTick {
  readonly sourceId: string | null;
  readonly type: ConditionType;
  readonly damageType: DamageType;
  readonly amount: number;
  readonly effectId?: number;
}
