"use client";

import type { ItemDisplayRarity, ItemTooltipData } from "@tibia/protocol";
import type { DragEvent, PointerEvent, ReactNode } from "react";
import { useItemTooltipAnchor } from "../../hooks/useItemTooltipAnchor";
import { ITEM_RARITY_STYLES } from "../../lib/items/itemRarityStyles";
import { ItemTooltipPortal } from "./ItemTooltipPortal";
import { SpriteIcon } from "./SpriteIcon";

interface ItemCellProps {
  /** Absent draws an empty frame — a slot with nothing in it. */
  readonly spriteId?: number;
  /** Appearance id, so animated art resolves its phases exactly. */
  readonly clientId?: number;
  /** Stack size; the badge appears above 1 and the art becomes a pile. */
  readonly count?: number;
  /** Server-composed hover card; omit for a cell with nothing in it. */
  readonly tooltip?: ItemTooltipData;
  /** Grade ring. Callers decide whether "common" is worth tinting. */
  readonly rarity?: ItemDisplayRarity;
  /**
   * Ring override for a grid that colours by something other than the item's
   * grade — the bestiary colours its drops by drop chance.
   */
  readonly borderClassName?: string;
  /** `compact` is the 40px bestiary cell; `regular` the 64px inventory one. */
  readonly size?: "compact" | "regular";
  readonly label?: string;
  readonly title?: string;
  /** Fades the art: an unchosen filter cell, an in-flight move. */
  readonly dimmed?: boolean;
  /** Toggle state, for cells that are a choice rather than an object. */
  readonly pressed?: boolean;
  /** Corner badge — the loot filter's check mark. */
  readonly marker?: ReactNode;
  readonly disabled?: boolean;
  readonly draggable?: boolean;
  readonly onClick?: () => void;
  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDrag?: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
  readonly onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
  /** Anything drawn inside the frame on top of the art. */
  readonly children?: ReactNode;
}

const SIZES = {
  compact: { box: "size-10", scale: 1 },
  regular: { box: "size-16", scale: 2 },
} as const;

/**
 * One item in a grid, everywhere in the game: inventory and equipment slots,
 * trade offers, bestiary drop tables, loot-filter cells. It owns the frame,
 * the sprite, the stack badge, the rarity ring and the hover tooltip;
 * callers own what a click means and hand it their own drag handlers.
 */
export function ItemCell({
  spriteId,
  clientId,
  count,
  tooltip,
  rarity,
  borderClassName,
  size = "regular",
  label,
  title,
  dimmed,
  pressed,
  marker,
  disabled,
  draggable,
  onClick,
  onContextMenu,
  onDragStart,
  onDrag,
  onDragEnd,
  onDragOver,
  onDrop,
  onPointerUp,
  children,
}: ItemCellProps) {
  const { tooltipId, point, close, anchorProps } = useItemTooltipAnchor();
  const grade = rarity ? ITEM_RARITY_STYLES[rarity] : undefined;
  const frame = SIZES[size];
  const ring =
    borderClassName ??
    (grade
      ? `${grade.border} ${grade.glow}`
      : "border-ui-stone/35 shadow-inner shadow-black/55");

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        draggable={draggable}
        title={title}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDragStart={(event) => {
          close();
          onDragStart?.(event);
        }}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPointerUp={onPointerUp}
        {...(tooltip ? anchorProps : {})}
        className={`group relative flex ${frame.box} items-center justify-center overflow-hidden rounded-lg border bg-black/30 transition-[border-color,background-color] enabled:hover:border-ui-gold/40 enabled:hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:outline-none disabled:cursor-default ${ring} ${
          pressed ? "bg-ui-gold/10 ring-1 ring-ui-gold/50" : ""
        }`}
      >
        {spriteId !== undefined && (
          <SpriteIcon
            spriteId={spriteId}
            clientId={clientId}
            count={count}
            scale={frame.scale}
            className={dimmed ? "opacity-55" : undefined}
          />
        )}
        {marker && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 text-sm leading-none font-bold [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
          >
            {marker}
          </span>
        )}
        {count !== undefined && count > 1 && (
          <span className="absolute right-0.5 bottom-0.5 rounded-md border border-ui-gold/15 bg-black/80 px-1.5 text-xs leading-4 font-semibold text-ui-text">
            {count}
          </span>
        )}
        {children}
      </button>
      {tooltip && (
        <ItemTooltipPortal tooltipId={tooltipId} point={point} item={tooltip} />
      )}
    </>
  );
}
