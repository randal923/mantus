import type { SpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { SpriteIcon } from "../inventory/SpriteIcon";

const FRAME =
  "flex size-11 shrink-0 items-center justify-center rounded-xl border border-ui-stone-light/25 bg-black/35 shadow-inner shadow-black/60";

export function SpellIcon(artwork: SpellIconArtwork) {
  if (artwork.kind === "item") {
    return (
      <span aria-hidden className={FRAME}>
        <SpriteIcon
          spriteId={artwork.spriteId}
          clientId={artwork.clientId}
          scale={1.25}
        />
      </span>
    );
  }

  const iconSize = 40;
  const isCurrentSheet = artwork.sheet === "current";
  const x = isCurrentSheet
    ? artwork.index * iconSize
    : (artwork.index % 12) * iconSize;
  const y = isCurrentSheet ? 0 : Math.floor(artwork.index / 12) * iconSize;

  return (
    <span aria-hidden className={FRAME}>
      <span
        className="block size-10 rounded-lg bg-no-repeat [image-rendering:pixelated]"
        style={{
          backgroundImage: `url("/images/game/spells/${isCurrentSheet ? "spell-icons-32x32.png" : "defaultspells.png"}")`,
          backgroundPosition: `-${x}px -${y}px`,
          backgroundSize: isCurrentSheet
            ? `${187 * iconSize}px ${iconSize}px`
            : `${12 * iconSize}px ${11 * iconSize}px`,
        }}
      />
    </span>
  );
}
