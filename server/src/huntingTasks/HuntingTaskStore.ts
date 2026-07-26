import type { TaskHuntingState } from "@tibia/protocol";

/** Durable copy of one hunting task slot; timestamps are epoch ms. */
export interface TaskSlotRecord {
  readonly slot: number;
  readonly state: TaskHuntingState;
  readonly grid: ReadonlyArray<number>;
  readonly selectedRaceId: number | null;
  readonly upgrade: boolean;
  readonly rarity: number;
  readonly kills: number;
  readonly disabledUntilMs: number;
  readonly freeRerollAtMs: number;
}

export interface TaskSnapshot {
  readonly slots: ReadonlyArray<TaskSlotRecord>;
  readonly taskPoints: number;
  readonly wildcards: number;
}

export type TaskChargeResult =
  | { readonly status: "committed"; readonly goldAfter: number }
  | { readonly status: "insufficient-gold" };

export type TaskWildcardSpendResult =
  | { readonly status: "committed"; readonly wildcardsAfter: number }
  | { readonly status: "insufficient-wildcards" };

export type TaskClaimResult =
  | { readonly status: "committed"; readonly taskPointsAfter: number }
  | { readonly status: "not-claimable" };

/**
 * Durable hunting-task state. Gold/wildcard spends and the claim's point
 * grant run inside the store in one ACID transaction with the ledger/audit
 * rows and the slot mutation (charter rules 2 and 11). The claim's
 * conditional guard (kills and selection re-checked in SQL) is what makes
 * racing claims grant exactly once.
 */
export interface HuntingTaskStore {
  load(characterId: string): Promise<TaskSnapshot | null>;
  initialize(
    characterId: string,
    slots: ReadonlyArray<TaskSlotRecord>,
  ): Promise<void>;
  saveSlot(characterId: string, record: TaskSlotRecord): Promise<void>;
  chargeGold(
    characterId: string,
    priceGold: number,
    record: TaskSlotRecord,
    kind: "reroll" | "cancel",
  ): Promise<TaskChargeResult>;
  spendWildcards(
    characterId: string,
    cost: number,
    event: "hunting-task-star-reroll" | "hunting-task-wildcard-list",
    record: TaskSlotRecord,
  ): Promise<TaskWildcardSpendResult>;
  /**
   * Erases the slot and credits the points only if the durable row still
   * shows the expected selection with enough kills and a claimable state.
   */
  claimTask(
    characterId: string,
    expected: { slot: number; raceId: number; minKills: number },
    points: number,
    record: TaskSlotRecord,
  ): Promise<TaskClaimResult>;
}
