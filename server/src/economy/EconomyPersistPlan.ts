import type { CarriedPersistPlan } from "../item/CarriedPersistPlan";
import type { BankLedgerEntryType } from "./BankLedgerEntryType";

/**
 * One character's bank balance moving as part of an economy write.
 *
 * `expectedBalanceAfter` is the balance the in-memory cache already committed
 * to. The writer locks the row, applies the delta and rejects any
 * disagreement, so a balance that has drifted from the database is caught on
 * the next write instead of being spent twice.
 */
export interface BankBalanceOp {
  readonly characterId: string;
  /** Signed: negative debits, positive credits. */
  readonly delta: number;
  readonly expectedBalanceAfter: number;
  readonly ledger: BankLedgerEntryType;
  readonly counterpartyCharacterId?: string;
}

/** A finite shop offer's stock decrement, guarded on the catalog's stock. */
export interface ShopStockOp {
  readonly shopId: string;
  readonly offerId: string;
  readonly initialStock: number;
  readonly amount: number;
  readonly expectedRemaining: number;
}

export type EconomyPersistAudit =
  | {
      readonly kind: "shop-purchase";
      readonly npcTypeId: string;
      readonly shopId: string;
      readonly offerId: string;
      readonly itemTypeId: number;
      readonly amount: number;
      readonly totalCost: number;
      readonly bankSpent: number;
      readonly subtype?: number;
      readonly stockRemaining?: number;
      readonly currencyItemTypeId?: number;
    }
  | {
      readonly kind: "shop-sale";
      readonly npcTypeId: string;
      readonly shopId: string;
      readonly offerId: string;
      readonly itemTypeId: number;
      readonly amount: number;
      readonly totalProceeds: number;
      readonly bankCredited: number;
      readonly subtype?: number;
      readonly currencyItemTypeId?: number;
    }
  | {
      readonly kind: "bank-deposit" | "bank-withdraw";
      readonly amount: number;
      readonly balanceAfter: number;
    }
  | {
      readonly kind: "bank-transfer";
      readonly amount: number;
      readonly toCharacterId: string;
      readonly balanceAfter: number;
    };

/**
 * The durable half of a memory-first economy operation: the carried row ops
 * plus the money, stock and audit legs that must land with them. Everything
 * here commits in one transaction, so an item can never appear without its
 * payment or its audit row (charter rules 2 and 11).
 */
export interface EconomyPersistPlan {
  readonly carried: CarriedPersistPlan;
  readonly bankOps?: ReadonlyArray<BankBalanceOp>;
  readonly stockOps?: ReadonlyArray<ShopStockOp>;
  readonly audits?: ReadonlyArray<EconomyPersistAudit>;
}
