/** Currency fields shared by every page of one shop-opened projection. */
export interface ShopCurrencyProjection {
  readonly currencyItemTypeId: number;
  readonly currencySpriteId: number;
  readonly currencyName: string;
  readonly currencyAmount: number;
  readonly currencyWeight: number;
  readonly coinWeights: {
    readonly gold: number;
    readonly platinum: number;
    readonly crystal: number;
  };
}
