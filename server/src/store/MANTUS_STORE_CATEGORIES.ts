import type { StoreCategory } from "@tibia/protocol";

export const MANTUS_STORE_CATEGORIES: StoreCategory[] = [
  {
    id: "premium-time",
    offers: [
      {
        id: "premium-30",
        price: 250,
        premiumDays: 30,
        featured: true,
      },
      {
        id: "premium-90",
        price: 750,
        premiumDays: 90,
      },
      {
        id: "premium-180",
        price: 1_500,
        premiumDays: 180,
      },
      {
        id: "premium-360",
        price: 3_000,
        premiumDays: 360,
      },
    ],
  },
  {
    // Item products are delivered to the buyer's inbox in the purchase's own
    // transaction, so a delivery that cannot land rolls the coin debit back.
    id: "useful-things",
    offers: [
      {
        id: "golden-backpack",
        price: 60,
        item: { itemTypeId: 2871, count: 1 },
        featured: true,
      },
      { id: "blank-rune", price: 15, item: { itemTypeId: 3147, count: 10 } },
      { id: "rope", price: 10, item: { itemTypeId: 3003, count: 1 } },
      { id: "shovel", price: 10, item: { itemTypeId: 3457, count: 1 } },
    ],
  },
];
