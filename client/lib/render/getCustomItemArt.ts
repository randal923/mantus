import { PORTABLE_SELLER_TYPE_ID } from "@tibia/protocol";

/** A hand-drawn PNG strip that replaces the atlas art for one custom item. */
export interface CustomItemArt {
  /** Asset path under /assets, a horizontal strip of equal square frames. */
  readonly src: string;
  /** Total frames in the strip. */
  readonly frames: number;
  /** Square frame edge in native pixels. */
  readonly frameSize: number;
  /** The strip frame drawn when nothing is animating. */
  readonly restingFrame: number;
}

const CUSTOM_ART: ReadonlyMap<number, CustomItemArt> = new Map([
  [
    PORTABLE_SELLER_TYPE_ID,
    {
      src: "store/items/portable_seller.png",
      frames: 4,
      // 64px frames: at the default 2× icon scale they render 1:1, so the
      // art keeps its detail instead of round-tripping through 32px.
      frameSize: 64,
      restingFrame: 0,
    },
  ],
  [
    // The bound container (Tibia's store inbox): hand-drawn trunk, closed
    // at rest, open as frame 1 (the bound-items button's hover/open state).
    23_396,
    {
      src: "ui/bound-items-trunk.png",
      frames: 2,
      frameSize: 32,
      restingFrame: 0,
    },
  ],
]);

/**
 * The bespoke icon art a custom item type ships instead of aliased atlas
 * sprites, if it ships any. Keyed by appearance/client id, like getItemTint.
 */
export function getCustomItemArt(
  clientId?: number,
): CustomItemArt | undefined {
  return clientId === undefined ? undefined : CUSTOM_ART.get(clientId);
}
