"use client";

import { useEffect, useRef } from "react";
import type { CreatureOutfit } from "@tibia/protocol";
import { getOutfitAnimationFrames } from "../../lib/render/getOutfitAnimationFrames";

interface AnimatedOutfitProps {
  outfit: CreatureOutfit;
  scale?: number;
  /**
   * Fits the sprite inside a square box of this size (px): large outfits
   * shrink instead of clipping, small ones upscale at most 2x.
   */
  fit?: number;
  /** Renders a black silhouette for locked bestiary entries. */
  silhouette?: boolean;
  className?: string;
}

/** Looping south-facing walk animation of a creature outfit (DOM, no Pixi). */
export function AnimatedOutfit({
  outfit,
  scale = 2,
  fit,
  silhouette = false,
  className,
}: AnimatedOutfitProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    void getOutfitAnimationFrames(outfit)
      .then(({ frames, frameDurationMs }) => {
        if (cancelled || frames.length === 0) return;
        const display = document.createElement("canvas");
        display.width = frames[0].width;
        display.height = frames[0].height;
        const appliedScale = fit
          ? Math.min(2, fit / Math.max(display.width, display.height))
          : scale;
        display.style.width = `${display.width * appliedScale}px`;
        display.style.height = `${display.height * appliedScale}px`;
        display.style.imageRendering = "pixelated";
        const context = display.getContext("2d");
        if (!context) return;
        let index = 0;
        const draw = () => {
          context.clearRect(0, 0, display.width, display.height);
          context.drawImage(frames[index], 0, 0);
          if (silhouette) {
            context.globalCompositeOperation = "source-in";
            context.fillStyle = "#0a0a0a";
            context.fillRect(0, 0, display.width, display.height);
            context.globalCompositeOperation = "source-over";
          }
          index = (index + 1) % frames.length;
        };
        draw();
        if (frames.length > 1) timer = setInterval(draw, frameDurationMs);
        host.replaceChildren(display);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`failed to render animated outfit: ${reason}`);
      });
    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
      host.replaceChildren();
    };
  }, [outfit, scale, fit, silhouette]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className={`block leading-none ${className ?? ""}`}
    />
  );
}
