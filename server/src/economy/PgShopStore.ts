import type { Pool } from "pg";
import { runSerializableTransaction } from "./runSerializableTransaction";
import type {
  ShopOfferKey,
  ShopRestockSchedule,
  ShopStockRow,
  ShopStore,
} from "./ShopStore";
import { readShopStockQuery } from "./sql/readShopStockQuery";
import { restockDueOffersQuery } from "./sql/restockDueOffersQuery";
import { seedShopRestockQuery } from "./sql/seedShopRestockQuery";

/**
 * Durable finite-stock bookkeeping for shops. Buying and selling are planned in
 * memory and committed by `PgEconomyPersistOps`, so nothing transactional for a
 * single trade lives here — only the stock rows the restock sweep owns.
 */
export class PgShopStore implements ShopStore {
  constructor(private readonly pool: Pool) {}

  async seedRestockSchedules(
    schedules: ReadonlyArray<ShopRestockSchedule>,
  ): Promise<void> {
    if (schedules.length === 0) return;
    await runSerializableTransaction(this.pool, async (client) => {
      for (const schedule of schedules) {
        await client.query(seedShopRestockQuery, [
          schedule.shopId,
          schedule.offerId,
          schedule.stock,
          schedule.restockIntervalSeconds ?? null,
        ]);
      }
    });
  }

  async readStock(): Promise<ReadonlyArray<ShopStockRow>> {
    const stock = await this.pool.query<{
      shop_id: string;
      offer_id: string;
      initial_stock: number;
      remaining_stock: number;
    }>(readShopStockQuery);
    return stock.rows.map((row) => ({
      shopId: row.shop_id,
      offerId: row.offer_id,
      initialStock: row.initial_stock,
      remainingStock: row.remaining_stock,
    }));
  }

  async restockDueOffers(): Promise<ReadonlyArray<ShopOfferKey>> {
    return runSerializableTransaction(this.pool, async (client) => {
      const restocked = await client.query<{
        shop_id: string;
        offer_id: string;
      }>(restockDueOffersQuery);
      return restocked.rows.map((row) => ({
        shopId: row.shop_id,
        offerId: row.offer_id,
      }));
    });
  }
}
