/**
 * One completed Portable Seller sweep, kept just long enough to drive the
 * icon's sale animation. `id` is the server's per-session saleId, so repeat
 * sales re-fire the effect.
 */
export interface PortableSellerSaleNotice {
  readonly id: number;
  readonly itemId: string;
}
