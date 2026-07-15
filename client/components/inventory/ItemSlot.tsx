import type { InventoryItem } from "./inventoryTypes";
import { SpriteIcon } from "./SpriteIcon";

interface ItemSlotProps {
  item?: InventoryItem;
  /** Ghost silhouette shown while the slot is empty (equipment slots). */
  placeholderSpriteId?: number;
}

/** One recessed inventory cell; the item sprite sits directly on it. */
export function ItemSlot({ item, placeholderSpriteId }: ItemSlotProps) {
  return (
    <div
      title={item ? `${item.count > 1 ? `${item.count} ` : ""}${item.name}` : undefined}
      className="group relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-ui-stone/35 bg-black/30 shadow-inner shadow-black/55 transition-[border-color,background-color] hover:border-ui-gold/40 hover:bg-white/5"
    >
      {item ? (
        <SpriteIcon spriteId={item.spriteId} />
      ) : (
        placeholderSpriteId !== undefined && (
          <SpriteIcon
            spriteId={placeholderSpriteId}
            className="opacity-15 grayscale brightness-150"
          />
        )
      )}
      {item && item.count > 1 && (
        <span className="absolute right-0.5 bottom-0.5 rounded-md border border-ui-gold/15 bg-black/80 px-1.5 text-xs leading-4 font-semibold text-ui-text">
          {item.count}
        </span>
      )}
    </div>
  );
}
