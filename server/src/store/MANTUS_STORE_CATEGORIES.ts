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
];
