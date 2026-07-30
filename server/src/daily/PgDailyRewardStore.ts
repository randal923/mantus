import type { Pool, PoolClient } from "pg";
import { PREY_RULES, type DailyRewardKind } from "@tibia/protocol";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemMutation } from "../item/ItemMutation";
import { grantWildcardsQuery } from "../prey/sql/grantWildcardsQuery";
import { insertPreyAuditQuery } from "../prey/sql/insertPreyAuditQuery";
import { insertPreyResourcesRowQuery } from "../prey/sql/insertPreyResourcesRowQuery";
import { assessDailyStreak, type DailyStreakRecord } from "./assessDailyStreak";
import { claimDailyStreak } from "./claimDailyStreak";
import type {
  DailyClaimRequest,
  DailyClaimResult,
  DailyHistoryRecord,
  DailyRewardSnapshot,
  DailyRewardStore,
} from "./DailyRewardStore";
import { ensureDailyRowQuery } from "./sql/ensureDailyRowQuery";
import { insertDailyAuditQuery } from "./sql/insertDailyAuditQuery";
import { insertDailyHistoryQuery } from "./sql/insertDailyHistoryQuery";
import { lockDailyRowQuery } from "./sql/lockDailyRowQuery";
import { readDailyHistoryQuery } from "./sql/readDailyHistoryQuery";
import { readDailyRowQuery } from "./sql/readDailyRowQuery";
import { updateDailyClaimQuery } from "./sql/updateDailyClaimQuery";

const GRANT_REASON = "daily-reward";

interface HistoryRow {
  reward_day: number;
  kind: DailyRewardKind;
  allowance: number;
  items: Array<{ typeId: number; count: number }>;
  claimed_at_ms: string;
}

interface DailyRow {
  streak_position: number;
  streak_level: number;
  joker_tokens: number;
  last_claim_day: string | null;
  last_joker_month: string | null;
  xp_boost_until_ms: string;
}

function recordOf(row: DailyRow | undefined): DailyRewardSnapshot {
  return {
    streakPosition: row?.streak_position ?? 0,
    streakLevel: row?.streak_level ?? 0,
    jokerTokens: row?.joker_tokens ?? 0,
    lastClaimDay: row?.last_claim_day ?? null,
    lastJokerMonth: row?.last_joker_month ?? null,
    xpBoostUntilMs: Number(row?.xp_boost_until_ms ?? 0),
  };
}

/**
 * Durable daily-reward claims: one SERIALIZABLE transaction locks the
 * streak row (the once-per-day gate), re-runs the shared streak assessment
 * on the locked state, grants every reward leg (carried items, capped prey
 * wildcards, the XP-boost deadline), advances the streak, and writes the
 * audit. Two concurrent claims of one day leave exactly one grant
 * (charter rules 2 and 11).
 */
export class PgDailyRewardStore implements DailyRewardStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async load(characterId: string): Promise<DailyRewardSnapshot> {
    const result = await this.pool.query<DailyRow>(readDailyRowQuery, [
      characterId,
    ]);
    return recordOf(result.rows[0]);
  }

  async history(
    characterId: string,
    limit: number,
  ): Promise<ReadonlyArray<DailyHistoryRecord>> {
    const result = await this.pool.query<HistoryRow>(readDailyHistoryQuery, [
      characterId,
      limit,
    ]);
    return result.rows.map((row) => ({
      claimedAtMs: Number(row.claimed_at_ms),
      rewardDay: row.reward_day,
      kind: row.kind,
      allowance: row.allowance,
      items: Array.isArray(row.items) ? row.items : [],
    }));
  }

  claim(request: DailyClaimRequest): Promise<DailyClaimResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(ensureDailyRowQuery, [request.characterId]);
      const locked = await client.query<DailyRow>(lockDailyRowQuery, [
        request.characterId,
      ]);
      const record: DailyStreakRecord = recordOf(locked.rows[0]);
      const assessment = assessDailyStreak(record, request.todayKey);
      if (!assessment.claimable) {
        return { status: "already-claimed" as const };
      }
      const claim = claimDailyStreak(assessment.settled, request.todayKey);
      if (claim.rewardDay !== request.expectedRewardDay) {
        throw new TransactionRollback<DailyClaimResult>({ status: "stale" });
      }
      const mutation = await this.grantItems(client, request);
      const wildcardsAfter = await this.grantWildcards(client, request);
      const boostMs = request.xpBoostMinutes * 60_000;
      const updated = await client.query<{ xp_boost_until_ms: string }>(
        updateDailyClaimQuery,
        [
          request.characterId,
          claim.next.streakPosition,
          claim.next.streakLevel,
          claim.next.jokerTokens,
          claim.next.lastClaimDay,
          claim.next.lastJokerMonth,
          boostMs > 0 ? request.nowMs : 0,
          boostMs,
        ],
      );
      const grantedItems = request.items.map((item) => ({
        typeId: item.typeId,
        count: item.count,
      }));
      await client.query(insertDailyAuditQuery, [
        request.characterId,
        JSON.stringify({
          day: claim.rewardDay,
          streakLevel: claim.next.streakLevel,
          jokersSpent: assessment.jokersSpent,
          streakLevelLost: assessment.streakLevelLost,
          items: grantedItems,
          wildcards: request.wildcards,
          xpBoostMinutes: request.xpBoostMinutes,
        }),
      ]);
      await client.query(insertDailyHistoryQuery, [
        request.characterId,
        claim.rewardDay,
        request.kind,
        request.allowance,
        JSON.stringify(grantedItems),
        request.nowMs,
      ]);
      return {
        status: "committed" as const,
        state: {
          ...claim.next,
          xpBoostUntilMs: Number(updated.rows[0]?.xp_boost_until_ms ?? 0),
        },
        mutation,
        wildcardsAfter,
      };
    });
  }

  private async grantItems(
    client: PoolClient,
    request: DailyClaimRequest,
  ): Promise<ItemMutation | null> {
    if (request.items.length === 0) return null;
    const coinOps = new PgCoinOperations(
      client,
      request.characterId,
      this.catalog,
    );
    const owned = await coinOps.loadOwnedItems();
    const backpack = await coinOps.lockBackpackSlots();
    if (!backpack) {
      throw new TransactionRollback<DailyClaimResult>({ status: "no-space" });
    }
    const after = new Map<string, Item>();
    for (const item of request.items) {
      const granted = item.stackable
        ? (await coinOps.grantStackable(
            coinOps.rowsOfType(owned, item.typeId),
            item.count,
            item.typeId,
            item.maxCount,
            GRANT_REASON,
            after,
            [],
            backpack,
          )) === 0
        : await coinOps.grantSingles(
            item.count,
            item.typeId,
            GRANT_REASON,
            after,
            backpack,
          );
      if (!granted) {
        throw new TransactionRollback<DailyClaimResult>({
          status: "no-space",
        });
      }
    }
    return { after: [...after.values()] };
  }

  private async grantWildcards(
    client: PoolClient,
    request: DailyClaimRequest,
  ): Promise<number | null> {
    if (request.wildcards <= 0) return null;
    await client.query(insertPreyResourcesRowQuery, [request.characterId]);
    const result = await client.query<{ wildcards: number }>(
      grantWildcardsQuery,
      [request.characterId, request.wildcards, PREY_RULES.maxWildcards],
    );
    const after =
      result.rows[0]?.wildcards === undefined
        ? null
        : Number(result.rows[0].wildcards);
    await client.query(insertPreyAuditQuery, [
      request.characterId,
      "prey-wildcard-grant",
      JSON.stringify({
        amount: request.wildcards,
        after,
        source: "daily-reward",
      }),
    ]);
    return after;
  }
}
