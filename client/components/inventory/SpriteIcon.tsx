"use client";

import { useAnimatedSpriteId } from "../../lib/render/useAnimatedSpriteId";
import { TILE_SIZE } from "../../lib/render/tileSize";

const PAD = 1;
const CELL = 34;
const COLS = 120;
const TILES_PER_SHEET = 14400;

interface SpriteIconProps {
  spriteId: number;
  /** The item's appearance id; lets the icon resolve its animation exactly. */
  clientId?: number;
  /** Zoom multiplier; sprites are 32px, default renders at 64px. */
  scale?: number;
  className?: string;
}

/**
 * Renders one 32×32 atlas sprite as a DOM element (no Pixi). Items whose
 * Tibia.dat appearance has several phases — exercise weapons, supreme potions,
 * love elixirs — cycle through them here just as they do in the world.
 */
export function SpriteIcon({
  spriteId,
  clientId,
  scale = 2,
  className,
}: SpriteIconProps) {
  const cell = useAnimatedSpriteId(spriteId, clientId) - 1;
  const sheet = Math.floor(cell / TILES_PER_SHEET);
  const rem = cell % TILES_PER_SHEET;
  const x = (rem % COLS) * CELL + PAD;
  const y = Math.floor(rem / COLS) * CELL + PAD;

  return (
    <div
      aria-hidden
      className={className}
      style={{ width: TILE_SIZE * scale, height: TILE_SIZE * scale }}
    >
      <div
        className="origin-top-left [image-rendering:pixelated]"
        style={{
          width: TILE_SIZE,
          height: TILE_SIZE,
          transform: `scale(${scale})`,
          backgroundImage: `url(/assets/atlas-${sheet}.png)`,
          backgroundPosition: `${-x}px ${-y}px`,
        }}
      />
    </div>
  );
}
