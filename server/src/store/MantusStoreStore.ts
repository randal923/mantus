import type { StoreOffer } from "@tibia/protocol";

export type MantusStorePurchaseResult =
  | {
      readonly status: "committed";
      readonly balance: number;
      readonly premiumUntil: Date;
    }
  | {
      readonly status: "insufficient-coins" | "premium-limit" | "unavailable";
    };

export interface MantusStoreStore {
  purchase(input: {
    readonly accountId: string;
    readonly characterId: string;
    readonly offer: StoreOffer;
  }): Promise<MantusStorePurchaseResult>;
}
