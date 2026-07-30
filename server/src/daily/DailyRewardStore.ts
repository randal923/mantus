import type { DailyRewardKind } from "@tibia/protocol";
import type { ItemMutation } from "../item/ItemMutation";
import type { DailyStreakRecord } from "./assessDailyStreak";

export interface DailyRewardSnapshot extends DailyStreakRecord {
  readonly xpBoostUntilMs: number;
}

export interface DailyClaimItemGrant {
  readonly typeId: number;
  readonly count: number;
  readonly stackable: boolean;
  readonly maxCount: number;
}

export interface DailyClaimRequest {
  readonly characterId: string;
  /** Server-local YYYY-MM-DD; the once-per-day gate key. */
  readonly todayKey: string;
  /** The day the service projected; a mismatch on the locked row aborts. */
  readonly expectedRewardDay: number;
  /** Today's reward kind, recorded on the history row. */
  readonly kind: DailyRewardKind;
  /** Units, wildcards or boost minutes this claim pays. */
  readonly allowance: number;
  readonly items: ReadonlyArray<DailyClaimItemGrant>;
  readonly wildcards: number;
  readonly xpBoostMinutes: number;
  readonly nowMs: number;
}

/** One past claim, newest first. Item names resolve from the catalog. */
export interface DailyHistoryRecord {
  readonly claimedAtMs: number;
  readonly rewardDay: number;
  readonly kind: DailyRewardKind;
  readonly allowance: number;
  readonly items: ReadonlyArray<{ typeId: number; count: number }>;
}

export type DailyClaimResult =
  | {
      readonly status: "committed";
      readonly state: DailyRewardSnapshot;
      readonly mutation: ItemMutation | null;
      readonly wildcardsAfter: number | null;
    }
  | { readonly status: "already-claimed" }
  | { readonly status: "stale" }
  | { readonly status: "no-space" };

export interface DailyRewardStore {
  load(characterId: string): Promise<DailyRewardSnapshot>;
  claim(request: DailyClaimRequest): Promise<DailyClaimResult>;
  history(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<DailyHistoryRecord>>;
}
