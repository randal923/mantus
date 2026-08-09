/**
 * One item type this server adds on top of the generated Canary catalog.
 *
 * A custom type is a stock item with a new identity: it copies every stat and
 * render flag of `baseTypeId` and replaces only the fields named here. The
 * base also supplies the sprite, which is why `id` must appear in
 * `CUSTOM_ITEM_APPEARANCES` paired with the same base — that is the entry the
 * client uses to draw it.
 */
export interface CustomItemType {
  /** Above the ripped appearance range, so it can never collide with Canary. */
  readonly id: number;
  readonly baseTypeId: number;
  readonly name: string;
  readonly article: string;
  readonly charges?: number;
  readonly description: string;
  /** Overrides the base's movability (the Portable Seller never drops). */
  readonly movable?: boolean;
}
