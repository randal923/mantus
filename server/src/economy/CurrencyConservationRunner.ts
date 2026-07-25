import type { CurrencyConservationReport } from "./CurrencyConservationReport";
import type { CurrencyReconciler } from "./CurrencyReconciler";

const SWEEP_INTERVAL_MS = 300_000;

/**
 * Schedules the conservation sweep off-tick. The sweep is read-only and never
 * touches live game state, so it is safe to run beside the tick; only its
 * scheduling is driven from there.
 *
 * The last report stays available for operator tooling to read.
 */
export class CurrencyConservationRunner {
  private nextSweepAt = 0;
  private operation: Promise<void> | null = null;
  private lastReport: CurrencyConservationReport | null = null;

  constructor(private readonly reconciler?: CurrencyReconciler) {}

  get report(): CurrencyConservationReport | null {
    return this.lastReport;
  }

  tick(now: number): void {
    if (!this.reconciler || this.operation || now < this.nextSweepAt) return;
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;
    this.operation = this.reconciler
      .run()
      .then((report) => {
        this.lastReport = report;
        if (!report.balanced) this.alert(report);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`currency conservation sweep failed: ${reason}`);
      })
      .finally(() => {
        this.operation = null;
      });
  }

  async stop(): Promise<void> {
    await this.operation;
  }

  private alert(report: CurrencyConservationReport): void {
    console.error(
      "currency conservation drift detected:",
      JSON.stringify({
        observedAt: report.observedAt.toISOString(),
        total: report.total,
        unexplainedCoinDelta: report.unexplainedCoinDelta,
        bankLedgerDrift: report.bankLedgerDrift.length,
        bankLedgerBreaks: report.bankLedgerBreaks.length,
        orphanCoinRows: report.orphanCoinRows.length,
      }),
    );
  }
}
