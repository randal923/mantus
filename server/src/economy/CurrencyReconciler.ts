import {
  CRYSTAL_COIN_TYPE_ID,
  CRYSTAL_WORTH,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  PLATINUM_WORTH,
} from "@tibia/protocol";
import type { Pool } from "pg";
import type {
  BankLedgerBreak,
  BankLedgerDrift,
  CurrencyConservationReport,
  OrphanCoinRow,
} from "./CurrencyConservationReport";
import { parseBalance } from "./parseBalance";
import { bankLedgerBreakQuery } from "./sql/bankLedgerBreakQuery";
import { bankLedgerDriftQuery } from "./sql/bankLedgerDriftQuery";
import { currencyAuditFlowQuery } from "./sql/currencyAuditFlowQuery";
import { currencySupplyQuery } from "./sql/currencySupplyQuery";
import { orphanCoinRowsQuery } from "./sql/orphanCoinRowsQuery";

const MAX_REPORTED_ROWS = 50;

const COIN_ARGS = [
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  CRYSTAL_COIN_TYPE_ID,
  PLATINUM_WORTH,
  CRYSTAL_WORTH,
];

/**
 * Read-only conservation sweep over the money supply. Per-feature exploit
 * tests catch the dupes we already know about; this is the standing check for
 * the ones we do not, and it is the reason every economy transaction couples
 * its mutation to an audit row.
 *
 * Money lives in three pots — coin rows, bank balances, and open buy-offer
 * escrow — and moving between them mints and burns coins, so the pots are
 * checked separately rather than as one total:
 *
 * - **Coins** must move exactly as the audit log says (`Δcoins == minted -
 *   burned`). A deposit burns coins, a withdrawal mints them, and both are
 *   audited, so this holds across every economy flow.
 * - **Bank** balances must equal their ledger's running total, and each
 *   ledger row's balance step must equal the amount it records.
 * - **Escrow** is DB-constrained to `remaining_amount × unit_price`, so it is
 *   reported for operators rather than re-derived here.
 *
 * It never mutates: a real drift is repaired through ordinary audited
 * transactions, never by hand (charter rule 12). Every query is parameterized
 * (rule 7) and bounded.
 */
export class CurrencyReconciler {
  /** Coin pot and clock from the previous sweep; deltas are measured from it. */
  private previous: { coins: number; observedAt: Date } | null = null;

  constructor(private readonly pool: Pool) {}

  async run(): Promise<CurrencyConservationReport> {
    const observedAt = await this.databaseNow();
    const supply = await this.pool.query<{
      coins: string;
      bank: string;
      escrow: string;
    }>(currencySupplyQuery, COIN_ARGS);
    const row = supply.rows[0];
    if (!row) throw new Error("currency supply query returned no row");
    const coins = parseBalance(row.coins);
    const bank = parseBalance(row.bank);
    const escrow = parseBalance(row.escrow);
    const total = coins + bank + escrow;

    const previous = this.previous;
    const flow = previous
      ? await this.pool.query<{ minted: string; burned: string }>(
          currencyAuditFlowQuery,
          [...COIN_ARGS, previous.observedAt, observedAt],
        )
      : null;
    const minted = parseBalance(flow?.rows[0]?.minted ?? "0");
    const burned = parseBalance(flow?.rows[0]?.burned ?? "0");
    const unexplainedCoinDelta = previous
      ? coins - previous.coins - (minted - burned)
      : null;

    const drift = await this.pool.query<{
      character_id: string;
      balance: string;
      ledger_balance: string;
    }>(bankLedgerDriftQuery, [MAX_REPORTED_ROWS]);
    const bankLedgerDrift: BankLedgerDrift[] = drift.rows.map((entry) => ({
      characterId: entry.character_id,
      balance: parseBalance(entry.balance),
      ledgerBalance: parseBalance(entry.ledger_balance),
    }));

    const breaks = await this.pool.query<{
      id: string;
      character_id: string;
      entry_type: string;
      amount: string;
      balance_before: string;
      balance_after: string;
    }>(bankLedgerBreakQuery, [MAX_REPORTED_ROWS]);
    const bankLedgerBreaks: BankLedgerBreak[] = breaks.rows.map((entry) => ({
      entryId: entry.id,
      characterId: entry.character_id,
      entryType: entry.entry_type,
      amount: parseBalance(entry.amount),
      balanceBefore: parseBalance(entry.balance_before),
      balanceAfter: parseBalance(entry.balance_after),
    }));

    // Only rows created since the sweep started watching can be judged:
    // world-seeded and pre-audit rows legitimately predate the trail.
    const orphans = previous
      ? await this.pool.query<{
          id: string;
          item_type_id: number;
          count: number;
        }>(orphanCoinRowsQuery, [
          GOLD_COIN_TYPE_ID,
          PLATINUM_COIN_TYPE_ID,
          CRYSTAL_COIN_TYPE_ID,
          previous.observedAt,
          MAX_REPORTED_ROWS,
        ])
      : null;
    const orphanCoinRows: OrphanCoinRow[] = (orphans?.rows ?? []).map(
      (entry) => ({
        itemId: entry.id,
        itemTypeId: entry.item_type_id,
        count: entry.count,
      }),
    );

    this.previous = { coins, observedAt };
    return {
      observedAt,
      coins,
      bank,
      escrow,
      total,
      minted,
      burned,
      unexplainedCoinDelta,
      bankLedgerDrift,
      bankLedgerBreaks,
      orphanCoinRows,
      balanced:
        (unexplainedCoinDelta ?? 0) === 0 &&
        bankLedgerDrift.length === 0 &&
        bankLedgerBreaks.length === 0 &&
        orphanCoinRows.length === 0,
    };
  }

  /**
   * The window is measured on the database clock, not the server's, so a
   * skewed host cannot make audited flow fall outside the interval it is
   * being compared against.
   */
  private async databaseNow(): Promise<Date> {
    const result = await this.pool.query<{ now: Date }>("SELECT now() AS now");
    const now = result.rows[0]?.now;
    if (!now) throw new Error("database clock query returned no row");
    return now;
  }
}
