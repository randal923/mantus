const TILE = 32;
const PAD = 1;
const CELL = 34;
const COLS = 120;
const TILES_PER_SHEET = 14400;

interface SpriteIconProps {
  spriteId: number;
  /** Zoom multiplier; sprites are 32px, default renders at 64px. */
  scale?: number;
  className?: string;
}

/** Renders one 32×32 atlas sprite as a DOM element (no Pixi). */
export function SpriteIcon({ spriteId, scale = 2, className }: SpriteIconProps) {
  const cell = spriteId - 1;
  const sheet = Math.floor(cell / TILES_PER_SHEET);
  const rem = cell % TILES_PER_SHEET;
  const x = (rem % COLS) * CELL + PAD;
  const y = Math.floor(rem / COLS) * CELL + PAD;

  return (
    <div
      aria-hidden
      className={className}
      style={{ width: TILE * scale, height: TILE * scale }}
    >
      <div
        className="origin-top-left [image-rendering:pixelated]"
        style={{
          width: TILE,
          height: TILE,
          transform: `scale(${scale})`,
          backgroundImage: `url(/assets/atlas-${sheet}.png)`,
          backgroundPosition: `${-x}px ${-y}px`,
        }}
      />
    </div>
  );
}
