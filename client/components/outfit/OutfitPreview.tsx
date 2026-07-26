"use client";

import { useEffect, useRef } from "react";
import {
  getOutfitPreviewCanvas,
  type OutfitPreviewSelection,
} from "../../lib/render/getOutfitPreviewCanvas";

interface OutfitPreviewProps {
  selection: OutfitPreviewSelection;
  scale?: number;
  className?: string;
}

/** Live look preview for the outfit window; display only. */
export function OutfitPreview({
  selection,
  scale = 3,
  className,
}: OutfitPreviewProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    void getOutfitPreviewCanvas(selection)
      .then((canvas) => {
        if (cancelled) return;
        canvas.style.width = `${canvas.width * scale}px`;
        canvas.style.height = `${canvas.height * scale}px`;
        canvas.style.imageRendering = "pixelated";
        host.replaceChildren(canvas);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`failed to render outfit preview: ${reason}`);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, scale]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`block leading-none ${className ?? ""}`}
    />
  );
}
