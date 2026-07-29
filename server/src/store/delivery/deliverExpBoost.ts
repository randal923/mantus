import { TransactionRollback } from "../../economy/TransactionRollback";
import type { StorePurchaseEffect } from "../StorePurchaseEffect";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

/** Canary's store boost: one hour, stacked onto any remaining boost time. */
export const XP_BOOST_DURATION_MS = 60 * 60 * 1_000;

/**
 * The deadline the kill-experience path already reads (Feature 84's daily
 * rewards row). Buying a boost extends that one deadline rather than adding a
 * parallel timer, so a character can never be "boosted twice" and the
 * experience code needs no new branch.
 */
const ensureDailyRowQuery = `INSERT INTO character_daily_rewards (character_id)
       VALUES ($1)
       ON CONFLICT (character_id) DO NOTHING`;

const lockDailyRowQuery = `SELECT xp_boost_until_ms::text AS xp_boost_until_ms
       FROM character_daily_rewards
       WHERE character_id = $1
       FOR UPDATE`;

const extendBoostQuery = `UPDATE character_daily_rewards
       SET xp_boost_until_ms = $2::bigint, updated_at = now()
       WHERE character_id = $1`;

/**
 * Extends the XP boost by an hour from now, or from the current deadline when
 * one is still running. `nowMs` is the transaction's own clock, so a client
 * cannot lengthen its own boost (charter rules 1 and 8).
 */
export async function deliverExpBoost(
  context: StoreDeliveryContext,
): Promise<StorePurchaseEffect> {
  await context.client.query(ensureDailyRowQuery, [context.characterId]);
  const locked = await context.client.query<{ xp_boost_until_ms: string }>(
    lockDailyRowQuery,
    [context.characterId],
  );
  const nowMs = context.transactionNow.getTime();
  const current = Number(locked.rows[0]?.xp_boost_until_ms ?? 0);
  if (!Number.isSafeInteger(current)) {
    throw new TransactionRollback({ status: "failed" as const });
  }
  const untilMs = Math.max(current, nowMs) + XP_BOOST_DURATION_MS;
  await context.client.query(extendBoostQuery, [context.characterId, untilMs]);
  return { kind: "exp-boost", untilMs };
}
