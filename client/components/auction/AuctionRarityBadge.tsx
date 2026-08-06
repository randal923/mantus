"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ItemTooltipData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "../inventory/ItemTooltip";

interface AuctionRarityBadgeProps {
  tooltip: ItemTooltipData;
}

const RARITY_TEXT = {
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
} as const;

const RARITY_BORDER = {
  uncommon: "border-rarity-uncommon/50",
  rare: "border-rarity-rare/50",
  epic: "border-rarity-epic/50",
  legendary: "border-rarity-legendary/50",
} as const;

/**
 * Rarity-colored chip for a unique market listing; hovering shows the actual
 * escrowed item's tooltip so a buyer sees the exact affixes on offer.
 */
export function AuctionRarityBadge({ tooltip }: AuctionRarityBadgeProps) {
  const { t } = useAppTranslation();
  const tooltipId = useId();
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );
  // Every eligible equipable now carries a display grade; the chip only
  // exists to flag graded listings, so common stays badge-less.
  const rarity = tooltip.rarity;
  if (!rarity || rarity === "common") return null;

  const show = (bounds: DOMRect) => {
    setAnchor({
      left: Math.max(8, bounds.left - 328),
      top: Math.max(8, Math.min(bounds.top, window.innerHeight - 420)),
    });
  };

  return (
    <>
      <span
        tabIndex={0}
        aria-describedby={anchor ? tooltipId : undefined}
        onMouseEnter={(event) =>
          show(event.currentTarget.getBoundingClientRect())
        }
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => show(event.currentTarget.getBoundingClientRect())}
        onBlur={() => setAnchor(null)}
        className={`inline-flex cursor-help items-center gap-1.5 rounded-full border bg-black/35 px-2 py-0.5 text-xs font-medium ${RARITY_BORDER[rarity]} ${RARITY_TEXT[rarity]}`}
      >
        <span
          aria-hidden
          className="size-1.5 rotate-45 border border-current/60 bg-current/40"
        />
        {t(`itemTooltip.rarity.${rarity}`)}
      </span>
      {anchor &&
        createPortal(
          <div
            id={tooltipId}
            className="pointer-events-none fixed z-[100]"
            style={{ left: anchor.left, top: anchor.top }}
          >
            <ItemTooltip item={tooltip} />
          </div>,
          document.body,
        )}
    </>
  );
}
