import type { CoinPackage } from "@tibia/protocol";

export const PIX_COIN_PACKAGES: ReadonlyArray<CoinPackage> = [
  { id: "coins-100", coins: 100, amountCentavos: 1_000 },
  { id: "coins-250", coins: 250, amountCentavos: 2_500 },
  { id: "coins-500", coins: 500, amountCentavos: 5_000 },
  { id: "coins-1000", coins: 1_000, amountCentavos: 10_000 },
  { id: "coins-2500", coins: 2_500, amountCentavos: 25_000 },
  { id: "coins-5000", coins: 5_000, amountCentavos: 50_000 },
  { id: "coins-10000", coins: 10_000, amountCentavos: 100_000 },
];

export const PIX_COIN_PACKAGES_BY_ID: ReadonlyMap<string, CoinPackage> =
  new Map(PIX_COIN_PACKAGES.map((entry) => [entry.id, entry]));
