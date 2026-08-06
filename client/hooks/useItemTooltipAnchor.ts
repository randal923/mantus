"use client";

import { useCallback, useId, useState } from "react";

interface ItemTooltipAnchorPoint {
  readonly left: number;
  readonly top: number;
}

/** Panel size the placement keeps on screen; matches ItemTooltip's own box. */
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 420;
const GAP = 8;

interface ItemTooltipAnchor {
  readonly tooltipId: string;
  readonly point: ItemTooltipAnchorPoint | null;
  /** Hides the card outside the hover cycle — a drag starting, say. */
  readonly close: () => void;
  /** Spread onto the hoverable element; keyboard focus opens it too. */
  readonly anchorProps: {
    readonly "aria-describedby": string | undefined;
    readonly onMouseEnter: (event: { currentTarget: Element }) => void;
    readonly onMouseLeave: () => void;
    readonly onFocus: (event: { currentTarget: Element }) => void;
    readonly onBlur: () => void;
  };
}

/**
 * Places an item tooltip beside whatever the pointer is on. Shared by every
 * grid that shows item cells so they all open the same card in the same
 * place; the caller renders it with `ItemTooltipPortal`.
 */
export function useItemTooltipAnchor(): ItemTooltipAnchor {
  const tooltipId = useId();
  const [point, setPoint] = useState<ItemTooltipAnchorPoint | null>(null);

  const open = useCallback((event: { currentTarget: Element }) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Left of the cell by default, flipped to its right when there is no room
    // — a tooltip pinned off-screen is the same as no tooltip at all.
    const left =
      bounds.left - TOOLTIP_WIDTH - GAP >= GAP
        ? bounds.left - TOOLTIP_WIDTH - GAP
        : Math.min(
            bounds.right + GAP,
            Math.max(GAP, window.innerWidth - TOOLTIP_WIDTH - GAP),
          );
    setPoint({
      left,
      top: Math.max(
        GAP,
        Math.min(bounds.top, window.innerHeight - TOOLTIP_HEIGHT),
      ),
    });
  }, []);
  const close = useCallback(() => setPoint(null), []);

  return {
    tooltipId,
    point,
    close,
    anchorProps: {
      "aria-describedby": point ? tooltipId : undefined,
      onMouseEnter: open,
      onMouseLeave: close,
      onFocus: open,
      onBlur: close,
    },
  };
}
