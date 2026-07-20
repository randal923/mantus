"use client";

import type { BestiaryLootEntry } from "@tibia/protocol";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { ItemTooltip } from "../inventory/ItemTooltip";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface BestiaryLootItemProps {
  entry: BestiaryLootEntry;
  borderClassName: string;
}

/** One bestiary drop with the same server-authored tooltip used by inventory items. */
export function BestiaryLootItem({
  entry,
  borderClassName,
}: BestiaryLootItemProps) {
  const tooltipId = useId();
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  return (
    <>
      <li>
        <button
          type="button"
          aria-label={entry.tooltip.name}
          aria-describedby={anchor ? tooltipId : undefined}
          onMouseEnter={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setAnchor({
              left: Math.max(8, bounds.left - 328),
              top: Math.max(8, Math.min(bounds.top, window.innerHeight - 420)),
            });
          }}
          onMouseLeave={(event) => {
            if (event.currentTarget === document.activeElement) return;
            setAnchor(null);
          }}
          onFocus={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setAnchor({
              left: Math.max(8, bounds.left - 328),
              top: Math.max(8, Math.min(bounds.top, window.innerHeight - 420)),
            });
          }}
          onBlur={() => setAnchor(null)}
          className={`flex h-10 w-10 items-center justify-center rounded-sm border bg-black/40 transition-colors hover:border-ui-gold focus-visible:border-ui-gold focus-visible:outline-none ${borderClassName}`}
        >
          <SpriteIcon spriteId={entry.spriteId} scale={1} />
        </button>
      </li>
      {anchor &&
        createPortal(
          <div
            id={tooltipId}
            className="pointer-events-none fixed z-[100]"
            style={{ left: anchor.left, top: anchor.top }}
          >
            <ItemTooltip item={entry.tooltip} />
          </div>,
          document.body,
        )}
    </>
  );
}
