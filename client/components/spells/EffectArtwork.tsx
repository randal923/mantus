import { SpriteIcon } from "../inventory/SpriteIcon";
import { TILE_SIZE } from "@/lib/render/tileSize";

interface EffectArtworkProps {
  width: number;
  height: number;
  spriteIds: ReadonlyArray<number>;
  size?: number;
}

export function EffectArtwork({
  width,
  height,
  spriteIds,
  size = 40,
}: EffectArtworkProps) {
  const scale = size / (Math.max(width, height) * TILE_SIZE);

  return (
    <div
      aria-hidden
      className="relative shrink-0"
      style={{
        width: width * TILE_SIZE * scale,
        height: height * TILE_SIZE * scale,
      }}
    >
      {spriteIds.map((spriteId, index) => {
        if (spriteId === 0) return null;
        const x = index % width;
        const y = Math.floor(index / width);

        return (
          <div
            key={`${spriteId}-${index}`}
            className="absolute"
            style={{
              left: (width - 1 - x) * TILE_SIZE * scale,
              top: (height - 1 - y) * TILE_SIZE * scale,
            }}
          >
            <SpriteIcon spriteId={spriteId} scale={scale} />
          </div>
        );
      })}
    </div>
  );
}
