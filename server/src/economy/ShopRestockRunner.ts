import type { ShopCatalog } from "./ShopCatalog";
import type { ShopStockCache } from "./ShopStockCache";
import type { ShopRestockSchedule, ShopStore } from "./ShopStore";

const RESTOCK_SCAN_INTERVAL_MS = 60_000;

/**
 * Refills finite shop stock on a durable server-clock schedule. Nothing is
 * held in memory: each offer's own `restock_at` row is the lease, so the sweep
 * is idempotent across restarts and safe to run from more than one server —
 * a boundary crossed during downtime still refills exactly once.
 *
 * Runs entirely off-tick and touches no live game state.
 */
export class ShopRestockRunner {
  private nextScanAt = 0;
  private operation: Promise<void> | null = null;

  constructor(
    private readonly catalogs: ReadonlyMap<string, ShopCatalog>,
    private readonly stock: ShopStockCache,
    private readonly store?: ShopStore,
  ) {}

  /**
   * Reconciles the durable stock rows with the catalog, then loads them into
   * the in-memory mirror the tick decides purchases against. Call once at boot.
   */
  async seed(): Promise<void> {
    if (!this.store?.seedRestockSchedules) {
      this.stock.seed(this.catalogs, []);
      return;
    }
    const schedules: ShopRestockSchedule[] = [];
    for (const catalog of this.catalogs.values()) {
      for (const entry of catalog.entries) {
        if (entry.stock === undefined) continue;
        schedules.push({
          shopId: catalog.id,
          offerId: entry.offerId,
          stock: entry.stock,
          ...(entry.restockIntervalSeconds === undefined
            ? {}
            : { restockIntervalSeconds: entry.restockIntervalSeconds }),
        });
      }
    }
    await this.store.seedRestockSchedules(schedules);
    this.stock.seed(this.catalogs, (await this.store.readStock?.()) ?? []);
  }

  tick(now: number): void {
    if (!this.store?.restockDueOffers || this.operation) return;
    if (now < this.nextScanAt) return;
    this.nextScanAt = now + RESTOCK_SCAN_INTERVAL_MS;
    const restock = this.store.restockDueOffers();
    this.operation = restock
      .then((offers) => {
        if (offers.length === 0) return;
        // The sweep is the durable writer; the mirror follows it so the tick
        // sees the refill without re-reading the table.
        this.stock.restock(offers);
        console.info(`restocked ${offers.length} shop offer(s)`);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`shop restock sweep failed: ${reason}`);
      })
      .finally(() => {
        this.operation = null;
      });
  }

  async stop(): Promise<void> {
    await this.operation;
  }
}
