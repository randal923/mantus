export interface HouseToast {
  readonly kind: string;
  readonly houseName: string;
  readonly detail: string;
  readonly warningsLeft?: number;
}
