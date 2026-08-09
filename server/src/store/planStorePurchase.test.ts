import { describe, expect, it } from "vitest";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { BOUND_CONTAINER_TYPE_ID } from "../item/boundContainerTypeId";
import { planStorePurchase } from "./planStorePurchase";
import type { StoreCatalogSubOffer } from "./storeCatalog";
import type { StorePlayerSnapshot } from "./StorePlayerSnapshot";
import { xpBoostPrice } from "./xpBoostPrice";

const CHARACTER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";

const catalog = {
  require: (itemTypeId: number) => ({
    spriteId: itemTypeId,
    clientId: itemTypeId,
    name: `item-${itemTypeId}`,
    pickupable: true,
    maxCount: 100,
    containerCapacity: 5,
  }),
} as unknown as ItemCatalog;

function snapshotWith(
  overrides: Partial<StorePlayerSnapshot> = {},
): StorePlayerSnapshot {
  return {
    sex: "male",
    outfitAddonsByLookType: new Map(),
    mountIds: new Set(),
    uniqueItemTypeIds: new Set(),
    wildcards: 0,
    preySlotsUnlocked: false,
    huntingSlotsUnlocked: false,
    xpBoostActive: false,
    xpBoostPurchasesToday: 0,
    premiumDaysRemaining: 0,
    ...overrides,
  };
}

function plan(input: {
  offer: StoreCatalogSubOffer;
  balance?: number;
  premiumUntil?: Date | null;
  snapshot?: StorePlayerSnapshot;
  carriedItems?: ReadonlyArray<Item>;
  nextLockedPreySlot?: number | undefined;
}) {
  return planStorePurchase({
    offer: input.offer,
    accountId: ACCOUNT_ID,
    characterId: CHARACTER_ID,
    requestKey: "store-purchase:test:1",
    balance: input.balance ?? 10_000,
    premiumUntil: input.premiumUntil ?? null,
    snapshot: input.snapshot ?? snapshotWith(),
    xpBoostUntilMs: 0,
    nextLockedPreySlot: input.nextLockedPreySlot,
    nextLockedHuntingSlot: undefined,
    carriedItems: input.carriedItems ?? [],
    catalog,
    nowMs: 1_000_000,
  });
}

const boundRoot: Item = {
  id: "bound-root",
  typeId: BOUND_CONTAINER_TYPE_ID,
  count: 1,
  attributes: {},
  version: 1,
  location: { kind: "equipment", characterId: CHARACTER_ID, slot: "bound" },
};

function boundChild(id: string, slot: number): Item {
  return {
    id,
    typeId: 999,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "container", containerId: "bound-root", slot },
  };
}

describe("planStorePurchase", () => {
  it("refuses a purchase the balance cannot cover", () => {
    const planned = plan({
      offer: {
        id: "premium-30",
        price: 250,
        grant: { kind: "premium", days: 30 },
      },
      balance: 249,
    });
    expect(planned.status).toBe("insufficient-coins");
  });

  it("caps stored premium time like the transaction did", () => {
    const planned = plan({
      offer: {
        id: "premium-360",
        price: 2_000,
        grant: { kind: "premium", days: 360 },
      },
      premiumUntil: new Date(1_000_000 + 99_700 * 24 * 60 * 60 * 1_000),
    });
    expect(planned.status).toBe("premium-limit");
  });

  it("splits a stackable count into slotted rows around occupied slots", () => {
    const planned = plan({
      offer: {
        id: "potions",
        price: 100,
        grant: {
          kind: "stackable",
          itemTypeId: 999,
          count: 250,
          unique: false,
        },
      },
      carriedItems: [boundRoot, boundChild("occupied", 0)],
    });
    if (planned.status !== "planned") throw new Error(planned.status);
    expect(planned.persist.boundDelivery?.createBoundRoot).toBe(false);
    expect(
      planned.persist.boundDelivery?.rows.map((row) => [row.count, row.slot]),
    ).toEqual([
      [100, 1],
      [100, 2],
      [50, 3],
    ]);
    expect(planned.deliveredItems).toHaveLength(3);
    expect(planned.balanceAfter).toBe(9_900);
  });

  it("refuses a delivery the bound container cannot hold", () => {
    const planned = plan({
      offer: {
        id: "potions",
        price: 100,
        grant: {
          kind: "stackable",
          itemTypeId: 999,
          count: 300,
          unique: false,
        },
      },
      // Capacity is 5 and three slots are taken: three stacks cannot fit.
      carriedItems: [
        boundRoot,
        boundChild("a", 0),
        boundChild("b", 1),
        boundChild("c", 2),
      ],
    });
    expect(planned.status).toBe("inbox-full");
  });

  it("refuses a unique item the character already owns", () => {
    const planned = plan({
      offer: {
        id: "unique-thing",
        price: 100,
        grant: { kind: "item", itemTypeId: 424, count: 1, unique: true },
      },
      snapshot: snapshotWith({ uniqueItemTypeIds: new Set([424]) }),
    });
    expect(planned.status).toBe("already-owned");
  });

  it("prices the XP boost from the day's counter and pins it to the plan", () => {
    const planned = plan({
      offer: { id: "xp-boost", price: 30, grant: { kind: "exp-boost" } },
      snapshot: snapshotWith({ xpBoostPurchasesToday: 3 }),
    });
    if (planned.status !== "planned") throw new Error(planned.status);
    expect(planned.price).toBe(xpBoostPrice(3));
    expect(planned.persist.xpBoostCountBefore).toBe(3);
  });

  it("refuses the seventh XP boost of the day", () => {
    const planned = plan({
      offer: { id: "xp-boost", price: 30, grant: { kind: "exp-boost" } },
      snapshot: snapshotWith({ xpBoostPurchasesToday: 6 }),
    });
    expect(planned.status).toBe("limit-reached");
  });

  it("unlocks the next locked prey slot and refuses once none remain", () => {
    const offer: StoreCatalogSubOffer = {
      id: "prey-slot",
      price: 900,
      grant: { kind: "prey-slot" },
    };
    const unlocked = plan({ offer, nextLockedPreySlot: 2 });
    if (unlocked.status !== "planned") throw new Error(unlocked.status);
    expect(unlocked.effect).toEqual({ kind: "prey-slot", slot: 2 });

    expect(plan({ offer, nextLockedPreySlot: undefined }).status).toBe(
      "already-owned",
    );
  });

  it("never plans a name change from memory", () => {
    const planned = plan({
      offer: { id: "name-change", price: 250, grant: { kind: "name-change" } },
    });
    expect(planned.status).toBe("failed");
  });
});
