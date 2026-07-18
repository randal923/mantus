export interface ShopAvailabilityRule {
  readonly kind: "storage-at-least";
  readonly key: string;
  readonly value: number;
}
