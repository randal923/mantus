"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "./ItemTooltip";
import { SpriteIcon } from "./SpriteIcon";

interface ItemSlotProps {
  item?: InventoryItem;
  placeholderSpriteId?: number;
  onActivate?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: () => void;
}

/** One recessed inventory cell; owned item details are shown from server data. */
export function ItemSlot({
  item,
  placeholderSpriteId,
  onActivate,
  onDragStart,
  onDragEnd,
  onDrop,
}: ItemSlotProps) {
  const { t } = useAppTranslation();
  const optimistic = Boolean(
    item && "optimistic" in item && item.optimistic === true,
  );
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [dragPosition, setDragPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const emptyDragImageRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={!item && !onDrop}
        draggable={Boolean(item && onDragStart && !optimistic)}
        title={
          item
            ? t("inventory.itemTitle", {
                count: item.count > 1 ? `${item.count} ` : "",
                name: item.name,
              })
            : undefined
        }
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
          setAnchor(null);
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
          onDrop();
        }}
        onMouseEnter={(event) => {
          if (!item || optimistic) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setAnchor({
            left: Math.max(8, bounds.left - 328),
            top: Math.min(bounds.top, window.innerHeight - 420),
          });
        }}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => {
          if (!item || optimistic) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setAnchor({
            left: Math.max(8, bounds.left - 328),
            top: Math.min(bounds.top, window.innerHeight - 420),
          });
        }}
        onBlur={() => setAnchor(null)}
        className="group relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-ui-stone/35 bg-black/30 shadow-inner shadow-black/55 transition-[border-color,background-color] enabled:hover:border-ui-gold/40 enabled:hover:bg-white/5 disabled:cursor-default"
      >
        {item ? (
          <SpriteIcon
            spriteId={item.spriteId}
            className={optimistic ? "animate-pulse opacity-60" : undefined}
          />
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
      </button>
      <span
        ref={emptyDragImageRef}
        aria-hidden
        className="pointer-events-none fixed size-px opacity-0"
      />
      {item && dragPosition &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[100]"
            style={{ left: dragPosition.left, top: dragPosition.top }}
          >
            <SpriteIcon spriteId={item.spriteId} scale={1} />
          </div>,
          document.body,
        )}
      {item && !optimistic && anchor &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{ left: anchor.left, top: Math.max(8, anchor.top) }}
          >
            <ItemTooltip item={item.tooltip} />
          </div>,
          document.body,
        )}
    </>
  );
}
