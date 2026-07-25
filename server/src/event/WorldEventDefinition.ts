import type { Position } from "@tibia/protocol";

export interface WorldEventArea {
  readonly from: Position;
  readonly to: Position;
}

export interface WorldEventSpawn {
  readonly name: string;
  readonly amount: number;
  /** Fixed placement; otherwise the spawn is scattered across the area. */
  readonly position?: Position;
}

/** One step of an event's state machine, executed in order. */
export type WorldEventStage =
  | {
      readonly kind: "announce";
      readonly message: string;
      readonly advanceAfterMs: number;
    }
  | {
      readonly kind: "spawn";
      readonly monsters: ReadonlyArray<WorldEventSpawn>;
      readonly advanceAfterMs: number;
    };

/**
 * One durable world event, imported from Canary's raid revscripts. The roll
 * fields mirror Canary's Raid config: `initialChance` grows towards
 * `targetChancePerDay` with each failed check, capped by `maxChancePerCheck`.
 */
export interface WorldEventDefinition {
  readonly id: string;
  readonly sourcePath: string;
  readonly areas: ReadonlyArray<WorldEventArea>;
  readonly allowedDays: ReadonlyArray<string>;
  readonly minActivePlayers: number;
  readonly initialChance?: number;
  readonly targetChancePerDay: number;
  readonly maxChancePerCheck: number;
  readonly minGapBetweenMs?: number;
  readonly maxChecksPerDay?: number;
  readonly stages: ReadonlyArray<WorldEventStage>;
}
