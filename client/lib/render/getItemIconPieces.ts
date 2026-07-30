import type { AssetStore, TibiaObject } from "./AssetStore";
import { getItemIconPattern } from "./getItemIconPattern";

export interface ItemIconPiece {
  readonly spriteId: number;
  /** Column and row of this 32×32 piece inside the item's own art. */
  readonly column: number;
  readonly row: number;
}

export interface ItemIconFrame {
  readonly columns: number;
  readonly rows: number;
  readonly pieces: ReadonlyArray<ItemIconPiece>;
}

/**
 * Every 32×32 piece of one item frame, so an icon draws the whole item the way
 * OTClient's `UIItem` does: it renders the item into a framebuffer as large as
 * the item really is and scales that into the slot. A 2×2 cuckoo clock is four
 * pieces, not the one bottom-right corner sprite; a stack of 100 coins picks the
 * pile art; and the phase argument is what animates it.
 *
 * Pieces are laid out with Tibia's bottom-right anchor: piece (w, h) sits at
 * column `width - 1 - w`, row `height - 1 - h`.
 */
export function getItemIconPieces(
  store: AssetStore,
  appearance: TibiaObject,
  phase: number,
  count: number,
): ItemIconFrame {
  const pattern = getItemIconPattern(appearance, count);
  const pieces: ItemIconPiece[] = [];
  for (let h = 0; h < appearance.height; h++) {
    for (let w = 0; w < appearance.width; w++) {
      const spriteId = store.spriteId(appearance, { ...pattern, w, h, phase });
      if (spriteId <= 0) continue;
      pieces.push({
        spriteId,
        column: appearance.width - 1 - w,
        row: appearance.height - 1 - h,
      });
    }
  }
  return { columns: appearance.width, rows: appearance.height, pieces };
}
