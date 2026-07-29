"use client";

import type { StoreIcon } from "@tibia/protocol";
import { OutfitPortrait } from "../characters/OutfitPortrait";
import { SpriteIcon } from "../inventory/SpriteIcon";

/** Glyphs for products with no sprite of their own, keyed by the server's symbol. */
const SYMBOL_GLYPHS: Record<
  Extract<StoreIcon, { kind: "symbol" }>["symbol"],
  string
> = {
  premium: "♛",
  "name-change": "✎",
  "sex-change": "⚥",
  "exp-boost": "✦",
  prey: "🜛",
  hunting: "⚔",
  temple: "⌂",
};

interface StoreProductIconProps {
  icon: StoreIcon;
  /** Box size in px; the sprite is fitted inside it. */
  size: number;
}

/**
 * Draws a store product from the client's own sprite assets. The server picks
 * *what* to draw — an item sprite, a look type, a mount, or a symbol — so the
 * icon can never disagree with what the purchase delivers.
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
    <span
      aria-hidden
      className="flex items-center justify-center rounded-lg border border-ui-gold/25 bg-black/35 font-display text-ui-gold"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {SYMBOL_GLYPHS[icon.symbol]}
    </span>
  );
}
