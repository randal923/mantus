export type PixOrderStatus =
  | "pending"
  | "paid"
  | "credited"
  | "cancelled"
  | "expired"
  | "refunded"
  | "refused";

export interface PixOrderRecord {
  readonly id: string;
  readonly accountId: string;
  readonly characterId: string | null;
  readonly packageId: string;
  readonly coins: number;
  readonly amountCentavos: number;
  readonly refundedCentavos: number;
  readonly providerPaymentId: string | null;
  readonly brcode: string | null;
  readonly status: PixOrderStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type PixOrderCreateResult =
  | { readonly status: "created"; readonly order: PixOrderRecord }
  | { readonly status: "pending-order-exists"; readonly order: PixOrderRecord }
  | { readonly status: "too-many-orders"; readonly recentCount: number };

/**
 * Why an approved provider payment was NOT turned into coins. Every refusal
 * is a fraud/integrity signal: the payment stays with the provider, the
 * order flips to `refused`, and an operator resolves it from the audit trail.
 */
export type PixSettleRefusal =
  | "amount-mismatch"
  | "amount-unknown"
  | "currency-mismatch"
  | "reference-mismatch";

export type PixSettleResult =
  | {
      readonly status: "credited";
      readonly orderId: string;
      readonly accountId: string;
      readonly characterId: string | null;
      readonly coins: number;
      readonly balance: number;
    }
  | { readonly status: "already-settled"; readonly orderId: string }
  | { readonly status: "not-found" }
  | {
      readonly status: "refused";
      readonly reason: PixSettleRefusal;
      readonly orderId: string;
    }
  | { readonly status: "balance-limit"; readonly orderId: string };

export type PixRefundResult =
  | {
      readonly status: "refunded";
      readonly orderId: string;
      readonly accountId: string;
      readonly coinsDebited: number;
      readonly balance: number;
      /** False for a partial refund: the order stays credited. */
      readonly complete: boolean;
    }
  | { readonly status: "already-refunded"; readonly orderId: string }
  | { readonly status: "not-found" }
  | {
      readonly status: "refused";
      readonly reason: "reference-mismatch";
      readonly orderId: string;
    };

export type PixOperatorCreditResult =
  | PixSettleResult
  | {
      readonly status: "not-refused";
      readonly orderId: string;
      readonly orderStatus: PixOrderStatus;
    };

export interface PixOrderStore {
  createOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
    readonly packageId: string;
    readonly coins: number;
    readonly amountCentavos: number;
    readonly expiresAt: Date;
    /** Orders (any status) this account may create per rolling hour. */
    readonly maxPerHour: number;
  }): Promise<PixOrderCreateResult>;

  /**
   * Pins the provider charge onto a pending order that has none. Idempotent:
   * an order that already carries exactly this payment id is returned
   * whatever its status (the payment may have settled before the create
   * flow got here), so the caller can tell "late" from "lost".
   */
  attachCharge(input: {
    readonly orderId: string;
    readonly providerPaymentId: string;
    readonly brcode: string;
  }): Promise<PixOrderRecord | null>;

  /**
   * Pins a provider payment onto the order its external reference names when
   * that order carries no charge yet — the create flow was interrupted after
   * the provider accepted the charge, or the payment landed before
   * `attachCharge` committed. Refuses orders that already have a charge.
   */
  adoptPayment(input: {
    readonly orderId: string;
    readonly providerPaymentId: string;
  }): Promise<PixOrderRecord | null>;

  openOrderFor(accountId: string): Promise<PixOrderRecord | null>;

  orderById(orderId: string): Promise<PixOrderRecord | null>;

  recentOrdersForAccount(
    accountId: string,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>>;

  accountIdByCharacterName(normalizedName: string): Promise<string | null>;

  cancelOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
  }): Promise<"cancelled" | "not-found">;

  settleApproved(input: {
    readonly providerPaymentId: string;
    readonly amountCentavos: number | null;
    readonly currency: string | null;
    readonly externalReference: string | null;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixSettleResult>;

  /**
   * Operator override for a `refused` order whose money has been verified by
   * hand. Same ledger key as a normal settle, so it can never double-credit,
   * and still subject to the balance cap.
   */
  operatorCredit(input: {
    readonly orderId: string;
    readonly operatorCharacterId: string;
  }): Promise<PixOperatorCreditResult>;

  /**
   * `refundedCentavos` is the provider's cumulative refunded amount; null
   * means the whole payment. Coins are clawed back proportionally and only
   * for the part not yet applied, so replays and partial-then-full sequences
   * each debit exactly once.
   */
  markRefunded(input: {
    readonly providerPaymentId: string;
    readonly externalReference: string | null;
    readonly refundedCentavos: number | null;
    readonly snapshot: Record<string, unknown>;
    readonly operatorCharacterId?: string;
  }): Promise<PixRefundResult>;

  markProviderCancelled(
    providerPaymentId: string,
  ): Promise<PixOrderRecord | null>;

  expireStale(now: Date): Promise<ReadonlyArray<PixOrderRecord>>;

  /**
   * Claims the next batch of open orders for a provider re-check, stamping
   * `last_checked_at` so the never-checked and least-recently-checked orders
   * come first — no order can starve behind older ones.
   */
  claimForReconciliation(
    olderThan: Date,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>>;

  recordOperatorInspect(input: {
    readonly operatorCharacterId: string;
    readonly subject: string;
  }): Promise<void>;
}
