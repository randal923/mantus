import type { ShopCatalog } from "./ShopCatalog";
import type { ShopOfferKey, ShopStockRow } from "./ShopStore";

const keyOf = (shopId: string, offerId: string): string =>
  `${shopId}/${offerId}`;

/**
 * Remaining stock for finite offers, held in memory so a purchase can be
 * decided inside the tick. The durable row stays authoritative: it is seeded
 * from the database at boot, decremented here once a purchase is planned, and
 * written by a guarded decrement in the same transaction as the items — a
 * mismatch there throws and resyncs rather than overselling.
 *
 * Offers with unlimited stock never appear here.
 */
export class ShopStockCache {
  private readonly remaining = new Map<string, number>();
  private readonly initial = new Map<string, number>();

  /** Seeds from the catalog, then overlays the committed remaining counts. */
  seed(
    catalogs: ReadonlyMap<string, ShopCatalog>,
    rows: ReadonlyArray<ShopStockRow>,
  ): void {
    this.remaining.clear();
    this.initial.clear();
    for (const catalog of catalogs.values()) {
      for (const entry of catalog.entries) {
        if (entry.stock === undefined) continue;
        const key = keyOf(catalog.id, entry.offerId);
        this.initial.set(key, entry.stock);
        this.remaining.set(key, entry.stock);
      }
    }
    for (const row of rows) {
      const key = keyOf(row.shopId, row.offerId);
      // Only offers the catalog still lists are tracked, and the seed query
      // has already clamped a shrunk offer's remaining stock to its new total.
      const initial = this.initial.get(key);
      if (initial === undefined) continue;
      this.remaining.set(key, Math.min(row.remainingStock, initial));
    }
  }

  /** Absent for an unlimited offer; the planner then omits its stock leg. */
  get(
    shopId: string,
    offerId: string,
  ): { readonly initial: number; readonly remaining: number } | undefined {
    const key = keyOf(shopId, offerId);
    const initial = this.initial.get(key);
    const remaining = this.remaining.get(key);
    if (initial === undefined || remaining === undefined) return undefined;
    return { initial, remaining };
  }

  /** Records units sold once their purchase is committed to memory. */
  reserve(shopId: string, offerId: string, amount: number): void {
    const key = keyOf(shopId, offerId);
    const remaining = this.remaining.get(key);
    if (remaining === undefined) return;
    this.remaining.set(key, Math.max(0, remaining - amount));
  }

  /** Returns units to the offer after its write was abandoned. */
  release(shopId: string, offerId: string, amount: number): void {
    const key = keyOf(shopId, offerId);
    const remaining = this.remaining.get(key);
    const initial = this.initial.get(key);
    if (remaining === undefined || initial === undefined) return;
    this.remaining.set(key, Math.min(initial, remaining + amount));
  }

  /** Refills the offers a durable restock sweep just reset. */
  restock(offers: ReadonlyArray<ShopOfferKey>): void {
    for (const offer of offers) {
      const key = keyOf(offer.shopId, offer.offerId);
      const initial = this.initial.get(key);
      if (initial === undefined) continue;
      this.remaining.set(key, initial);
    }
  }
}
