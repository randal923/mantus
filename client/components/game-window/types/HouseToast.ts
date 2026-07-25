export interface HouseToast {
  readonly kind: string;
  readonly houseName: string;
  readonly detail: string;
  readonly warningsLeft?: number;
  /** Gold moved by the event (bid escrowed, outbid/auction refund). */
  readonly amount?: number;
}
