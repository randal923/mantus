export type PixOrderStatus =
  | "pending"
  | "paid"
  | "credited"
  | "cancelled"
  | "expired"
  | "refunded";

export interface PixOrderRecord {
  readonly id: string;
  readonly accountId: string;
  readonly characterId: string | null;
  readonly packageId: string;
  readonly coins: number;
  readonly amountCentavos: number;
  readonly providerPaymentId: string | null;
  readonly brcode: string | null;
  readonly status: PixOrderStatus;
  readonly expiresAt: Date;
}

export type PixOrderCreateResult =
  | { readonly status: "created"; readonly order: PixOrderRecord }
  | { readonly status: "pending-order-exists"; readonly order: PixOrderRecord };

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
  | { readonly status: "amount-mismatch"; readonly orderId: string }
  | { readonly status: "balance-limit"; readonly orderId: string };

export type PixRefundResult =
  | {
      readonly status: "refunded";
      readonly orderId: string;
      readonly accountId: string;
      readonly coinsDebited: number;
      readonly balance: number;
    }
  | { readonly status: "already-refunded"; readonly orderId: string }
  | { readonly status: "not-found" };

export interface PixOrderStore {
  createOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
    readonly packageId: string;
    readonly coins: number;
    readonly amountCentavos: number;
    readonly expiresAt: Date;
  }): Promise<PixOrderCreateResult>;

  attachCharge(input: {
    readonly orderId: string;
    readonly providerPaymentId: string;
    readonly brcode: string;
  }): Promise<PixOrderRecord | null>;

  openOrderFor(accountId: string): Promise<PixOrderRecord | null>;

  cancelOrder(input: {
    readonly orderId: string;
    readonly accountId: string;
    readonly characterId: string | null;
  }): Promise<"cancelled" | "not-found">;

  settleApproved(input: {
    readonly providerPaymentId: string;
    readonly amountCentavos: number | null;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixSettleResult>;

  markRefunded(input: {
    readonly providerPaymentId: string;
    readonly snapshot: Record<string, unknown>;
  }): Promise<PixRefundResult>;

  markProviderCancelled(
    providerPaymentId: string,
  ): Promise<PixOrderRecord | null>;

  expireStale(now: Date): Promise<ReadonlyArray<PixOrderRecord>>;

  openForReconciliation(
    olderThan: Date,
    limit: number,
  ): Promise<ReadonlyArray<PixOrderRecord>>;
}
