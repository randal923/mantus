"use client";

import type { ImbuementMaterial } from "@tibia/protocol";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemTooltip } from "../inventory/ItemTooltip";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ImbuementMaterialBoxProps {
  material: ImbuementMaterial;
  /** Sprite for the material's item type, resolved by the caller. */
  spriteId?: number;
}

/**
 * One astral source as Tibia's imbuing window shows it: the item sprite with
 * its required count, red while the player is short. `available` already
 * counts the stash, because applying spends from there too. Hovering opens the
 * server-authored item card the inventory uses, with the stash share appended.
 */
export function ImbuementMaterialBox({
  material,
  spriteId,
}: ImbuementMaterialBoxProps) {
  const { t } = useAppTranslation();
  const tooltipId = useId();
  const [anchor, setAnchor] = useState<
    { left: number; y: number; above: boolean } | null
  >(null);
  const covered = material.available >= material.count;
  const fromStash = material.stashAvailable > 0;
  const tooltip = material.tooltip;

  const showFrom = (element: HTMLElement) => {
    if (!tooltip) return;
    const bounds = element.getBoundingClientRect();
    const above = bounds.top > window.innerHeight / 2;
    setAnchor({
      // The card is w-80 (320px): centred on the box, kept on screen.
      left: Math.min(
        Math.max(8, bounds.left + bounds.width / 2 - 160),
        Math.max(8, window.innerWidth - 328),
      ),
      // Held by its bottom edge while the row sits in the lower half of the
      // screen — where the apply panel normally is — so a card of any height
      // clears the sources it describes without being measured first.
      above,
      y: above ? window.innerHeight - bounds.top + 8 : bounds.bottom + 8,
    });
  };

  return (
    <>
      <li
        tabIndex={0}
        aria-describedby={anchor ? tooltipId : undefined}
        className={`flex size-24 min-w-0 flex-col items-center justify-center gap-1 border bg-black/40 p-1 transition-colors focus-visible:border-ui-gold focus-visible:outline-none ${
          covered
            ? "border-ui-stone-light/20 hover:border-ui-gold/40"
            : "border-ui-accent/50 hover:border-ui-accent"
        }`}
        title={
          tooltip
            ? undefined
            : fromStash
              ? t("imbuement.materialFromStash", {
                  name: material.name,
                  stash: material.stashAvailable,
                })
              : material.name
        }
        onPointerEnter={(event) => showFrom(event.currentTarget)}
        onPointerLeave={() => setAnchor(null)}
        onFocus={(event) => showFrom(event.currentTarget)}
        onBlur={() => setAnchor(null)}
      >
        <span className="flex size-11 items-center justify-center">
          {spriteId !== undefined && (
            <SpriteIcon spriteId={spriteId} scale={1.25} />
          )}
        </span>
        <span
          className={`text-sm tabular-nums ${
            covered ? "text-ui-text-bright" : "text-ui-accent-light"
          }`}
        >
          {material.available}/{material.count}
        </span>
      </li>
      {tooltip &&
        anchor &&
        createPortal(
          <div
            id={tooltipId}
            className="pointer-events-none fixed z-[100] w-80"
            style={{
              left: anchor.left,
              ...(anchor.above ? { bottom: anchor.y } : { top: anchor.y }),
            }}
          >
            <ItemTooltip item={tooltip} />
            {fromStash && (
              <p className="mt-1 rounded border border-ui-stone/70 bg-ui-panel-deep/95 px-3 py-1.5 font-tibia text-sm text-ui-muted">
                {t("imbuement.materialStashShare", {
                  stash: material.stashAvailable,
                })}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
