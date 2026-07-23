import { MAX_PREMIUM_DAYS, STORE_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isSerializationFailure } from "../guild/isSerializationFailure";
import type {
  MantusStorePurchaseResult,
  MantusStoreStore,
} from "./MantusStoreStore";

interface LockedAccount {
  readonly mantus_coins: string;
  readonly premium_until: Date | null;
  readonly transaction_now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

export class PgMantusStore implements MantusStoreStore {
  constructor(private readonly pool: Pool) {}

  async purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: {
      readonly id: string;
      readonly price: number;
      readonly premiumDays: number;
    };
  }): Promise<MantusStorePurchaseResult> {
    this.validate(input);
    let lastCause: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runSerializableTransaction(this.pool, async (client) => {
          const locked = await client.query<LockedAccount>(
            `SELECT mantus_coins, premium_until,
               CURRENT_TIMESTAMP AS transaction_now
             FROM accounts
             WHERE id = $1
             FOR UPDATE`,
            [input.accountId],
          );
          const account = locked.rows[0];
          if (!account) {
            throw new TransactionRollback<MantusStorePurchaseResult>({
              status: "unavailable",
            });
          }
          const balance = Number(account.mantus_coins);
          if (!Number.isSafeInteger(balance) || balance < input.offer.price) {
            throw new TransactionRollback<MantusStorePurchaseResult>({
              status: "insufficient-coins",
            });
          }
          const transactionNow = account.transaction_now.getTime();
          const premiumUntil = account.premium_until?.getTime() ?? 0;
          const startsAt = Math.max(transactionNow, premiumUntil);
          const nextPremiumUntil = new Date(
            startsAt + input.offer.premiumDays * DAY_MS,
          );
          if (
            nextPremiumUntil.getTime() - transactionNow >
            MAX_PREMIUM_DAYS * DAY_MS
          ) {
            throw new TransactionRollback<MantusStorePurchaseResult>({
              status: "premium-limit",
            });
          }
          const balanceAfter = balance - input.offer.price;
          const updated = await client.query(
            `UPDATE accounts
             SET mantus_coins = $2, premium_until = $3
             WHERE id = $1`,
            [input.accountId, balanceAfter, nextPremiumUntil],
          );
          if (updated.rowCount !== 1) {
            throw new Error("store account update failed");
          }
          await client.query(
            `INSERT INTO mantus_coin_ledger (
               account_id, entry_type, amount, balance_after, offer_id
             ) VALUES ($1, 'purchase', $2, $3, $4)`,
            [
              input.accountId,
              -input.offer.price,
              balanceAfter,
              input.offer.id,
            ],
          );
          await client.query(
            `INSERT INTO audit_log(event_type, character_id, details)
             VALUES (
               'store-purchase', $1,
               jsonb_build_object(
                 'accountId', $2::text, 'offerId', $3::text,
                 'price', $4::integer, 'balanceAfter', $5::bigint,
                 'premiumUntil', $6::timestamptz
               )
             )`,
            [
              input.characterId,
              input.accountId,
              input.offer.id,
              input.offer.price,
              balanceAfter,
              nextPremiumUntil,
            ],
          );
          return {
            status: "committed" as const,
            balance: balanceAfter,
            premiumUntil: nextPremiumUntil,
          };
        });
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  private validate(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: {
      readonly id: string;
      readonly price: number;
      readonly premiumDays: number;
    };
  }): void {
    if (
      input.accountId.length < 1 ||
      input.accountId.length > 128 ||
      input.characterId.length < 1 ||
      input.characterId.length > 128 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.offer.id) ||
      !Number.isSafeInteger(input.offer.price) ||
      input.offer.price < 1 ||
      input.offer.price > STORE_LIMITS.maxBalance ||
      !Number.isInteger(input.offer.premiumDays) ||
      input.offer.premiumDays < 1 ||
      input.offer.premiumDays > 365
    ) {
      throw new Error("invalid store purchase");
    }
  }
}
