import { SpriteIcon } from "../inventory/SpriteIcon";

const SPRITE_SIZE = 32;

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
  const scale = size / (Math.max(width, height) * SPRITE_SIZE);

  return (
    <div
      aria-hidden
      className="relative shrink-0"
      style={{
        width: width * SPRITE_SIZE * scale,
        height: height * SPRITE_SIZE * scale,
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
              left: (width - 1 - x) * SPRITE_SIZE * scale,
              top: (height - 1 - y) * SPRITE_SIZE * scale,
            }}
          >
            <SpriteIcon spriteId={spriteId} scale={scale} />
          </div>
        );
      })}
    </div>
  );
}
