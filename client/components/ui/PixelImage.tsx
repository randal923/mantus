import type { CSSProperties } from "react";

interface PixelImageProps {
  /** Asset path under /assets, e.g. "ui/prey/prey_star.png". */
  src: string;
  /** Natural sheet dimensions (the PNG's full size). */
  sheetWidth: number;
  sheetHeight: number;
  /** Clip origin inside the sheet; defaults to the top-left corner. */
  x?: number;
  y?: number;
  /** Clip size; defaults to the full sheet. */
  width?: number;
  height?: number;
  /** Zoom applied to the native pixels. */
  scale?: number;
  className?: string;
  /** Extra positioning styles merged after the sprite geometry. */
  style?: CSSProperties;
}

/** Draws a (clipped) region of a ripped UI image, scaled and pixelated. */
export function PixelImage({
  src,
  sheetWidth,
  sheetHeight,
  x = 0,
  y = 0,
  width = sheetWidth,
  height = sheetHeight,
  scale = 1,
  className,
  style,
}: PixelImageProps) {
  return (
    <div
      aria-hidden
      className={`[image-rendering:pixelated] ${className ?? ""}`}
      style={{
        width: width * scale,
        height: height * scale,
        backgroundImage: `url(/assets/${src})`,
        backgroundPosition: `${-x * scale}px ${-y * scale}px`,
        backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
        ...style,
      }}
    />
  );
}
