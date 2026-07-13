import type { InventoryItem } from "./inventoryTypes";
import { SpriteIcon } from "./SpriteIcon";

interface ItemSlotProps {
  item?: InventoryItem;
  /** Ghost silhouette shown while the slot is empty (equipment slots). */
  placeholderSpriteId?: number;
}

/** One inventory square: a flat recessed tint; the item sprite sits directly on it. */
export function ItemSlot({ item, placeholderSpriteId }: ItemSlotProps) {
  return (
    <div
      title={item ? `${item.count > 1 ? `${item.count} ` : ""}${item.name}` : undefined}
      className="relative flex size-18 items-center justify-center rounded-md bg-black/20 inset-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
    >
      {item ? (
        <SpriteIcon spriteId={item.spriteId} />
      ) : (
        placeholderSpriteId !== undefined && (
          <SpriteIcon spriteId={placeholderSpriteId} className="opacity-20 brightness-0 invert" />
        )
      )}
      {item && item.count > 1 && (
        <span className="absolute right-0.5 bottom-0.5 rounded-full bg-black/75 px-1 text-[10px] leading-4 font-bold text-white">
          {item.count}
        </span>
      )}
    </div>
  );
}
