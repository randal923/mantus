"use client";

import { getCustomItemArt } from "../../lib/render/getCustomItemArt";
import { AtlasSpriteIcon } from "./AtlasSpriteIcon";
import { CustomArtSpriteIcon } from "./CustomArtSpriteIcon";

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
 * Renders one item as a DOM element (no Pixi). Most items draw their atlas
 * sprites; a custom item that ships its own PNG strip (the Portable Seller)
 * draws that instead, so the DOM icon can show art the sprite pack does not
 * have. Hook-free by design: which branch renders depends on the client id,
 * and each branch owns its own hooks.
 */
export function SpriteIcon({
  spriteId,
  clientId,
  count = 1,
  scale = 2,
  className,
}: SpriteIconProps) {
  const art = getCustomItemArt(clientId);
  if (art && clientId !== undefined) {
    return (
      <CustomArtSpriteIcon
        art={art}
        clientId={clientId}
        scale={scale}
        className={className}
      />
    );
  }
  return (
    <AtlasSpriteIcon
      spriteId={spriteId}
      clientId={clientId}
      count={count}
      scale={scale}
      className={className}
    />
  );
}
