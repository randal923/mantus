"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { InventoryItem } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "./ItemTooltip";
import { SpriteIcon } from "./SpriteIcon";

interface ItemSlotProps {
  item?: InventoryItem;
  placeholderSpriteId?: number;
  onActivate?: () => void;
  onContextAction?: () => void;
}

/** One recessed inventory cell; owned item details are shown from server data. */
export function ItemSlot({
  item,
  placeholderSpriteId,
  onActivate,
  onContextAction,
}: ItemSlotProps) {
  const { t } = useAppTranslation();
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={!item}
        title={
          item
            ? t("inventory.itemTitle", {
                count: item.count > 1 ? `${item.count} ` : "",
                name: item.name,
              })
            : undefined
        }
        onClick={onActivate}
        onContextMenu={(event) => {
          if (!item || !onContextAction) return;
          event.preventDefault();
          onContextAction();
        }}
        onMouseEnter={(event) => {
          if (!item) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setAnchor({
            left: Math.max(8, bounds.left - 328),
            top: Math.min(bounds.top, window.innerHeight - 420),
          });
        }}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => {
          if (!item) return;
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
      </button>
      {item && anchor &&
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
