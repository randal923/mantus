"use client";

import type { StoreIcon } from "@tibia/protocol";
import Image from "next/image";
import { OutfitPortrait } from "../characters/OutfitPortrait";
import { SpriteIcon } from "../inventory/SpriteIcon";

/** The 64px product art under /assets/store/products, keyed by symbol. */
const PRODUCT_ART_SIZE = 64;

interface StoreProductIconProps {
  icon: StoreIcon;
  /** Box size in px; the sprite is fitted inside it. */
  size: number;
}

/**
 * Draws a store product from the client's own assets. The server picks *what*
 * to draw — an item sprite, a look type, a mount, or a symbol — so the icon
 * can never disagree with what the purchase delivers. A symbol names one of
 * the service offers (Premium Time, XP Boost, name change…) and draws the
 * official store art imported by tools/importOtclientStoreAssets.mjs.
 */
export function StoreProductIcon({ icon, size }: StoreProductIconProps) {
  if (icon.kind === "item") {
    return (
      <span
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <SpriteIcon
          spriteId={icon.spriteId}
          clientId={icon.clientId}
          scale={Math.max(1, size / 32)}
        />
      </span>
    );
  }

  if (icon.kind === "outfit" || icon.kind === "mount") {
    return (
      <span
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <OutfitPortrait
          outfit={{
            lookType: icon.lookType,
            head: 78,
            body: 69,
            legs: 58,
            feet: 76,
            addons: icon.kind === "outfit" ? icon.addons : 0,
          }}
          fit={size}
        />
      </span>
    );
  }

  return (
    <Image
      aria-hidden
      alt=""
      src={`/assets/store/products/${icon.symbol}.png`}
      width={size}
      height={size}
      draggable={false}
      // Pixel art scales up crisply; shrunk for a category button it reads
      // better resampled.
      className={
        size >= PRODUCT_ART_SIZE
          ? "block select-none [image-rendering:pixelated]"
          : "block select-none"
      }
    />
  );
}
