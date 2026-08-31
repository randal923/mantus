export interface PixCharge {
  readonly providerPaymentId: string;
  readonly brcode: string;
}

export interface PixPaymentStatus {
  readonly status:
    | "pending"
    | "approved"
    | "cancelled"
    | "refunded"
    | "unknown";
  readonly amountCentavos: number | null;
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
}
