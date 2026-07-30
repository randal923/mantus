"use client";

import { useItemIcon } from "../../lib/render/useItemIcon";
import { TILE_SIZE } from "../../lib/render/tileSize";

const PAD = 1;
const CELL = 34;
const COLS = 120;
const TILES_PER_SHEET = 14400;

interface SpriteIconProps {
  spriteId: number;
  /** The item's appearance id; lets the icon resolve its animation exactly. */
  clientId?: number;
  /** Stack size, for the pile art Tibia draws instead of a single item. */
  count?: number;
  /** Zoom multiplier; sprites are 32px, default renders at 64px. */
  scale?: number;
  className?: string;
}

/**
 * Renders one item as a DOM element (no Pixi). Items whose Tibia appearance has
 * several phases — exercise weapons, supreme potions, love elixirs — cycle
 * through them here just as they do in the world, and an item larger than one
 * tile is drawn whole and scaled into the slot, the way OTClient's item widget
 * does it.
 *
 * Layout is inline-styled rather than utility-classed: these icons are mounted
 * by tests and stories that do not load the app stylesheet, and a piece that
 * loses `position: absolute` lands outside its slot.
 */
export function SpriteIcon({
  spriteId,
  clientId,
  count = 1,
  scale = 2,
  className,
}: SpriteIconProps) {
  const { columns, rows, pieces } = useItemIcon(spriteId, clientId, count);
  const tiles = Math.max(columns, rows);
  const box = TILE_SIZE * scale;

  return (
    <div
      aria-hidden
      className={className}
      style={{
        width: box,
        height: box,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Scaled about its centre, so an item wider or taller than one tile sits
          in the middle of the slot instead of hanging off a corner. */}
      <div
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: TILE_SIZE * columns,
          height: TILE_SIZE * rows,
          transform: `scale(${scale / tiles})`,
        }}
      >
        {pieces.map((piece) => {
          const cell = piece.spriteId - 1;
          const sheet = Math.floor(cell / TILES_PER_SHEET);
          const rem = cell % TILES_PER_SHEET;
          const x = (rem % COLS) * CELL + PAD;
          const y = Math.floor(rem / COLS) * CELL + PAD;
          return (
            <div
              key={`${piece.column}:${piece.row}`}
              style={{
                position: "absolute",
                width: TILE_SIZE,
                height: TILE_SIZE,
                left: piece.column * TILE_SIZE,
                top: piece.row * TILE_SIZE,
                imageRendering: "pixelated",
                backgroundImage: `url(/assets/atlas-${sheet}.png)`,
                backgroundPosition: `${-x}px ${-y}px`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
