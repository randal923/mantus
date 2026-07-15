"use client";

import { useEffect, useRef } from "react";
import type { CharacterOutfit } from "@tibia/protocol";
import { getOutfitPortraitCanvas } from "../../lib/render/getOutfitPortraitCanvas";

interface OutfitPortraitProps {
  outfit: CharacterOutfit;
  scale?: number;
  className?: string;
}

export function OutfitPortrait({
  outfit,
  scale = 2,
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
        canvas.style.width = `${canvas.width * scale}px`;
        canvas.style.height = `${canvas.height * scale}px`;
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
  }, [outfit, scale]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`block leading-none ${className ?? ""}`}
    />
  );
}
