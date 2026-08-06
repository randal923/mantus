"use client";

import type { ItemTooltipData } from "@tibia/protocol";
import { createPortal } from "react-dom";
import { ItemTooltip } from "./ItemTooltip";

interface ItemTooltipPortalProps {
  readonly tooltipId: string;
  /** Viewport coordinates from `useItemTooltipAnchor`; null hides the card. */
  readonly point: { readonly left: number; readonly top: number } | null;
  readonly item: ItemTooltipData;
}

/** Renders one hovered item's tooltip above the page, out of any clipping. */
export function ItemTooltipPortal({
  tooltipId,
  point,
  item,
}: ItemTooltipPortalProps) {
  if (!point) return null;
  return createPortal(
    <div
      id={tooltipId}
      className="pointer-events-none fixed z-[100]"
      style={{ left: point.left, top: point.top }}
    >
      <ItemTooltip item={item} />
    </div>,
    document.body,
  );
}
