export interface PixCharge {
  readonly providerPaymentId: string;
  readonly brcode: string;
}

export interface PixPaymentStatus {
  readonly status:
    "pending" | "approved" | "cancelled" | "refunded" | "unknown";
  readonly amountCentavos: number | null;
  /**
   * Cumulative amount the provider has refunded on this payment; a partial
   * refund leaves `status` at approved and only moves this. Null when unsent.
   */
  readonly refundedCentavos: number | null;
  /** ISO 4217 code as reported by the provider; null when it sent none. */
  readonly currency: string | null;
  /** Our order id as echoed back by the provider; null when it sent none. */
  readonly externalReference: string | null;
  readonly snapshot: Record<string, unknown>;
}

export interface PixProvider {
  createCharge(input: {
    readonly orderId: string;
    readonly amountCentavos: number;
    readonly description: string;
    readonly payerEmail: string;
    readonly expiresAt: Date;
  }): Promise<PixCharge>;

  getPayment(providerPaymentId: string): Promise<PixPaymentStatus>;

  cancelPayment(providerPaymentId: string): Promise<boolean>;

  /**
   * Refunds the full payment to the payer. `idempotencyKey` pins the request
   * so a retried operator command cannot refund twice. Resolves true only
   * when the provider confirms the refund.
   */
  refundPayment(
    providerPaymentId: string,
    idempotencyKey: string,
  ): Promise<boolean>;
}
