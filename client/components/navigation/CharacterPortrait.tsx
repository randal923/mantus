"use client";

import { SpriteIcon } from "../inventory/SpriteIcon";

interface CharacterPortraitProps {
  characterName: string;
  level: number;
  spriteId: number;
  onClick?: () => void;
}

export function CharacterPortrait({
  characterName,
  level,
  spriteId,
  onClick,
}: CharacterPortraitProps) {
  return (
    <button
      type="button"
      title="Character"
      aria-label={`Open ${characterName}'s character panel`}
      disabled={!onClick}
      onClick={onClick}
      className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ui-gold/30 bg-radial from-ui-panel-light to-black shadow-lg shadow-black/25 outline-none transition-[border-color,box-shadow,filter] duration-150 hover:border-ui-gold/60 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none sm:size-16"
    >
      <div className="absolute inset-0 bg-linear-to-t from-ui-accent-deep/35 to-transparent" />
      <SpriteIcon
        spriteId={spriteId}
        scale={2}
        className="relative translate-y-1 transition-transform duration-150 group-hover:scale-105"
      />
      <span className="absolute right-0.5 bottom-0.5 flex min-w-5 items-center justify-center rounded-md border border-ui-gold/20 bg-black/80 px-1 py-0.5 text-xs font-semibold text-ui-gold">
        {level}
      </span>
    </button>
  );
}
