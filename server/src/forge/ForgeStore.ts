import type { ItemMutation } from "../item/ItemMutation";

export interface ForgeResourcesRecord {
  readonly dusts: number;
  readonly dustLevel: number;
}

/** One tier write the transaction must apply, guarded by version. */
export interface ForgeItemChange {
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly newTier: number;
}

export interface ForgeHistoryRow {
  readonly action:
    | "fusion"
    | "transfer"
    | "dust-to-slivers"
    | "slivers-to-cores"
    | "increase-dust-limit";
  readonly convergence: boolean;
  readonly success: boolean;
  readonly bonus: number;
  readonly tier: number;
  readonly description: string;
  readonly costGold: number;
  readonly costDust: number;
  readonly costCores: number;
  readonly gained: number;
}

export interface ForgeExchangeRequest {
  readonly action: "fusion" | "transfer";
  readonly changes: ReadonlyArray<ForgeItemChange>;
  readonly destroyItems: ReadonlyArray<{
    readonly itemId: string;
    readonly expectedVersion: number;
  }>;
  readonly coreCost: number;
  readonly dustCost: number;
  readonly goldCost: number;
  readonly history: ForgeHistoryRow;
}

export interface ForgeConversionRequest {
  readonly conversion:
    | "dust-to-slivers"
    | "slivers-to-cores"
    | "increase-dust-limit";
  readonly history: ForgeHistoryRow;
}

export type ForgeTransactionResult =
  | {
      readonly status: "committed";
      readonly resources: ForgeResourcesRecord;
      readonly mutation: ItemMutation;
    }
  | {
      readonly status:
        | "insufficient-dust"
        | "insufficient-gold"
        | "insufficient-cores"
        | "insufficient-slivers"
        | "dust-limit-reached"
        | "backpack-full"
        | "conflict";
    };

export interface ForgeHistoryPage {
  readonly entries: ReadonlyArray<
    ForgeHistoryRow & { readonly createdAt: number }
  >;
  readonly totalEntries: number;
}

/**
 * Durable Exaltation Forge state. Every exchange/conversion is one
 * SERIALIZABLE transaction over the item rows, the dust balance, the bank
 * leg, the history row, and the audit row (charter rules 2 and 11); dust
 * kill-credit is clamped to the cap in SQL.
 */
export interface ForgeStore {
  load(characterId: string): Promise<ForgeResourcesRecord>;
  grantDusts(characterId: string, amount: number): Promise<ForgeResourcesRecord>;
  exchange(
    characterId: string,
    request: ForgeExchangeRequest,
  ): Promise<ForgeTransactionResult>;
  conversion(
    characterId: string,
    request: ForgeConversionRequest,
  ): Promise<ForgeTransactionResult>;
  history(characterId: string, page: number, pageSize: number): Promise<ForgeHistoryPage>;
}
