"use client";

import { getItemTint } from "../../lib/render/getItemTint";
import { useItemIcon } from "../../lib/render/useItemIcon";
import { useSpriteCellUrls } from "../../lib/render/useSpriteCellUrls";
import { TILE_SIZE } from "../../lib/render/tileSize";

interface AtlasSpriteIconProps {
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
 * Each piece draws a 32×32 blob-URL crop of its sprite rather than a CSS
 * window into the 4096×4096 atlas: dozens of icons referencing full sheets
 * kept every touched sheet decoded in the compositor and made opening an
 * item panel jank on real GPUs.
 *
 * Layout is inline-styled rather than utility-classed: these icons are mounted
 * by tests and stories that do not load the app stylesheet, and a piece that
 * loses `position: absolute` lands outside its slot.
 */
export function AtlasSpriteIcon({
  spriteId,
  clientId,
  count = 1,
  scale = 2,
  className,
}: AtlasSpriteIconProps) {
  const { columns, rows, pieces, allSprites } = useItemIcon(
    spriteId,
    clientId,
    count,
  );
  // A server-added tier borrows stock art and recolours the spark that art
  // already animates, so the crop it draws is a tinted variant of the sprite.
  const urls = useSpriteCellUrls(pieces, allSprites, getItemTint(clientId));
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
        {pieces.map((piece, index) => {
          const place = `${piece.column}:${piece.row}`;
          const url = urls[index];
          return (
            <div
              key={place}
              data-sprite-id={piece.spriteId}
              style={{
                position: "absolute",
                width: TILE_SIZE,
                height: TILE_SIZE,
                left: piece.column * TILE_SIZE,
                top: piece.row * TILE_SIZE,
                imageRendering: "pixelated",
                ...(url ? { backgroundImage: `url(${url})` } : {}),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
