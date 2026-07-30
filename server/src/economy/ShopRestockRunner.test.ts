import { describe, expect, it, vi } from "vitest";
import type { ShopCatalog } from "./ShopCatalog";
import { ShopRestockRunner } from "./ShopRestockRunner";
import { ShopStockCache } from "./ShopStockCache";
import type {
  ShopOfferKey,
  ShopRestockSchedule,
  ShopStore,
} from "./ShopStore";

const catalogs = (
  ...entries: ReadonlyArray<{
    offerId: string;
    stock?: number;
    restockIntervalSeconds?: number;
  }>
): ReadonlyMap<string, ShopCatalog> =>
  new Map([
    [
      "sam",
      {
        id: "sam",
        npcTypeId: "sam",
        entries: entries.map((entry) => ({
          offerId: entry.offerId,
          itemTypeId: 3274,
          name: entry.offerId,
          minimumAmount: 1,
          maximumAmount: 1,
          buyPrice: 10,
          ...(entry.stock === undefined ? {} : { stock: entry.stock }),
          ...(entry.restockIntervalSeconds === undefined
            ? {}
            : { restockIntervalSeconds: entry.restockIntervalSeconds }),
        })),
      },
    ],
  ]);

const makeStore = (
  restockDueOffers = vi.fn(async (): Promise<ReadonlyArray<ShopOfferKey>> => []),
): {
  store: ShopStore;
  seedRestockSchedules: ReturnType<typeof vi.fn>;
  restockDueOffers: typeof restockDueOffers;
} => {
  const seedRestockSchedules = vi.fn(async () => undefined);
  return {
    store: {
      seedRestockSchedules,
      readStock: vi.fn(async () => []),
      restockDueOffers,
    } as unknown as ShopStore,
    seedRestockSchedules,
    restockDueOffers,
  };
};

describe("ShopRestockRunner", () => {
  it("seeds only offers the catalog gives finite stock", async () => {
    const { store, seedRestockSchedules } = makeStore();
    const runner = new ShopRestockRunner(
      catalogs(
        { offerId: "unlimited" },
        { offerId: "finite", stock: 5 },
        { offerId: "refilling", stock: 3, restockIntervalSeconds: 3_600 },
      ),
      new ShopStockCache(),
      store,
    );

    await runner.seed();

    expect(seedRestockSchedules).toHaveBeenCalledTimes(1);
    expect(
      seedRestockSchedules.mock.calls[0]?.[0] as ShopRestockSchedule[],
    ).toEqual([
      { shopId: "sam", offerId: "finite", stock: 5 },
      {
        shopId: "sam",
        offerId: "refilling",
        stock: 3,
        restockIntervalSeconds: 3_600,
      },
    ]);
  });

  it("sweeps on its own interval and never overlaps itself", async () => {
    let resolveSweep: (offers: ReadonlyArray<ShopOfferKey>) => void = () =>
      undefined;
    const restockDueOffers = vi.fn(
      () =>
        new Promise<ReadonlyArray<ShopOfferKey>>((resolve) => {
          resolveSweep = resolve;
        }),
    );
    const { store } = makeStore(restockDueOffers);
    const runner = new ShopRestockRunner(catalogs(), new ShopStockCache(), store);

    runner.tick(0);
    expect(restockDueOffers).toHaveBeenCalledTimes(1);
    // Due again by the clock, but the previous sweep is still in flight.
    runner.tick(120_000);
    expect(restockDueOffers).toHaveBeenCalledTimes(1);

    resolveSweep([]);
    await runner.stop();
    runner.tick(120_000);
    expect(restockDueOffers).toHaveBeenCalledTimes(2);
  });

  it("keeps sweeping after a failed sweep", async () => {
    const restockDueOffers = vi.fn(
      async (): Promise<ReadonlyArray<ShopOfferKey>> => {
        throw new Error("db down");
      },
    );
    const { store } = makeStore(restockDueOffers);
    const runner = new ShopRestockRunner(catalogs(), new ShopStockCache(), store);

    runner.tick(0);
    await runner.stop();
    runner.tick(120_000);
    await runner.stop();

    expect(restockDueOffers).toHaveBeenCalledTimes(2);
  });

  it("seeds the mirror from the committed remaining stock", async () => {
    const { store } = makeStore();
    (store as { readStock: unknown }).readStock = vi.fn(async () => [
      { shopId: "sam", offerId: "finite", initialStock: 5, remainingStock: 2 },
    ]);
    const stock = new ShopStockCache();
    const runner = new ShopRestockRunner(
      catalogs({ offerId: "unlimited" }, { offerId: "finite", stock: 5 }),
      stock,
      store,
    );

    await runner.seed();

    expect(stock.get("sam", "finite")).toEqual({ initial: 5, remaining: 2 });
    // An unlimited offer is never tracked, so the planner omits its stock leg.
    expect(stock.get("sam", "unlimited")).toBeUndefined();
  });

  it("refills the mirror for the offers a sweep reset", async () => {
    const restockDueOffers = vi.fn(
      async (): Promise<ReadonlyArray<ShopOfferKey>> => [
        { shopId: "sam", offerId: "finite" },
      ],
    );
    const { store } = makeStore(restockDueOffers);
    (store as { readStock: unknown }).readStock = vi.fn(async () => [
      { shopId: "sam", offerId: "finite", initialStock: 5, remainingStock: 0 },
    ]);
    const stock = new ShopStockCache();
    const runner = new ShopRestockRunner(
      catalogs({ offerId: "finite", stock: 5 }),
      stock,
      store,
    );

    await runner.seed();
    expect(stock.get("sam", "finite")?.remaining).toBe(0);

    runner.tick(0);
    await runner.stop();

    expect(stock.get("sam", "finite")?.remaining).toBe(5);
  });
});
