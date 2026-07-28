"use client";

import { useEffect, useRef } from "react";
import type { CharacterOutfit } from "@tibia/protocol";
import { getOutfitPortraitCanvas } from "../../lib/render/getOutfitPortraitCanvas";

interface OutfitPortraitProps {
  outfit: CharacterOutfit;
  scale?: number;
  /**
   * Fits the sprite inside a square box of this size (px): outfits are baked
   * alpha-trimmed, so a grid of them only lines up when each is scaled to its
   * own bounds. Upscales at most 2x, like `AnimatedOutfit`.
   */
  fit?: number;
  className?: string;
}

export function OutfitPortrait({
  outfit,
  scale = 2,
  fit,
  className,
}: OutfitPortraitProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    void getOutfitPortraitCanvas(outfit)
      .then((canvas) => {
        if (cancelled) return;
        const appliedScale = fit
          ? Math.min(2, fit / Math.max(canvas.width, canvas.height))
          : scale;
        canvas.style.width = `${canvas.width * appliedScale}px`;
        canvas.style.height = `${canvas.height * appliedScale}px`;
        canvas.style.imageRendering = "pixelated";
        host.replaceChildren(canvas);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`failed to render outfit portrait: ${reason}`);
      });
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [outfit, scale, fit]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`block leading-none ${className ?? ""}`}
    />
  );
}
