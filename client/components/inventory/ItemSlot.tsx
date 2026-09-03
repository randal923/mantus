"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemCell } from "./ItemCell";
import { ItemSlotImbuements } from "./ItemSlotImbuements";
import { SpriteIcon } from "./SpriteIcon";

interface ItemSlotProps {
  item?: InventoryItem;
  /** Item drawn flipped in this empty slot — a two-handed weapon's off-hand. */
  mirrorOf?: InventoryItem;
  placeholderSpriteId?: number;
  /**
   * Draws an empty slot open (hover glow) even when it takes no drops — the
   * bound trunk's slots, which only the server fills.
   */
  drawOpen?: boolean;
  onActivate?: () => void;
  /** Left click picks this item as the target of a pending use-with. */
  onSelect?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}

/** One recessed inventory cell; owned item details are shown from server data. */
export function ItemSlot({
  item,
  mirrorOf,
  placeholderSpriteId,
  drawOpen = false,
  onActivate,
  onSelect,
  onDragStart,
  onDragEnd,
  onDrop,
}: ItemSlotProps) {
  const { t } = useAppTranslation();
  const optimistic = Boolean(
    item && "optimistic" in item && item.optimistic === true,
  );
  // Only a rolled grade tints the slot: "common" is what every ordinary
  // sword and helmet reads as, and tinting those tints the whole bag.
  const rarity =
    item?.tooltip.rarity && item.tooltip.rarity !== "common"
      ? item.tooltip.rarity
      : undefined;
  const [dragPosition, setDragPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const emptyDragImageRef = useRef<HTMLSpanElement>(null);

  return (
    <span
      className={`group/slot relative inline-flex ${
        item && onSelect ? "cursor-crosshair" : ""
      }`}
    >
      <ItemCell
        spriteId={item?.spriteId}
        clientId={item?.clientId}
        count={item?.count}
        tooltip={item && !optimistic ? item.tooltip : undefined}
        rarity={rarity}
        dimmed={optimistic}
        disabled={!item && !onDrop && !drawOpen}
        draggable={Boolean(item && onDragStart && !optimistic)}
        title={
          item
            ? t("inventory.itemTitle", {
                count: item.count > 1 ? `${item.count} ` : "",
                name: item.name,
              })
            : undefined
        }
        onClick={item && onSelect && !optimistic ? onSelect : undefined}
        onContextMenu={(event) => {
          if (!item || optimistic) return;
          event.preventDefault();
          onActivate?.();
        }}
        onDragStart={(event) => {
          if (!item || !onDragStart || optimistic) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.id);
          if (emptyDragImageRef.current) {
            event.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0);
          }
          setDragPosition({ left: event.clientX, top: event.clientY });
          onDragStart();
        }}
        onDrag={(event) => {
          if (!dragPosition || (event.clientX === 0 && event.clientY === 0)) {
            return;
          }
          setDragPosition({ left: event.clientX, top: event.clientY });
        }}
        onDragEnd={() => {
          setDragPosition(null);
          onDragEnd?.();
        }}
        onDragOver={(event) => {
          if (!onDrop) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          if (!onDrop) return;
          event.preventDefault();
          event.stopPropagation();
          onDrop();
        }}
        onPointerUp={(event) => {
          if (event.button !== 0 || !onDrop) return;
          event.preventDefault();
          onDrop();
        }}
      >
        {!item && mirrorOf && (
          <SpriteIcon
            spriteId={mirrorOf.spriteId}
            clientId={mirrorOf.clientId}
            className="-scale-x-100"
          />
        )}
        {!item && !mirrorOf && placeholderSpriteId !== undefined && (
          <SpriteIcon
            spriteId={placeholderSpriteId}
            className="opacity-15 grayscale brightness-150"
          />
        )}
      </ItemCell>
      {item && item.imbuements && item.imbuements.length > 0 && (
        <ItemSlotImbuements imbuements={item.imbuements} />
      )}
      <span
        ref={emptyDragImageRef}
        aria-hidden
        className="pointer-events-none fixed size-px opacity-0"
      />
      {item &&
        dragPosition &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[100]"
            style={{ left: dragPosition.left, top: dragPosition.top }}
          >
            <SpriteIcon
              spriteId={item.spriteId}
              clientId={item.clientId}
              count={item.count}
              scale={1}
            />
          </div>,
          document.body,
        )}
    </span>
  );
}
