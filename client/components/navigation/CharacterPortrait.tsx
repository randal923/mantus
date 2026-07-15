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
      className="group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ui-accent/45 bg-radial from-ui-panel-light to-black shadow-[0_0_22px_rgba(70,164,157,0.12),inset_0_0_0_2px_rgba(255,255,255,0.04)] transition hover:border-ui-accent hover:shadow-[0_0_25px_rgba(70,164,157,0.25)] disabled:pointer-events-none sm:size-16"
    >
      <div className="absolute inset-0 bg-linear-to-t from-ui-accent/15 to-transparent" />
      <SpriteIcon
        spriteId={spriteId}
        scale={2}
        className="relative translate-y-1 transition-transform group-hover:scale-105"
      />
      <span className="absolute right-0 bottom-0 flex min-w-5 items-center justify-center rounded-tl-lg border-t border-l border-white/10 bg-[#101b20] px-1 py-0.5 text-xs font-bold text-ui-gold">
        {level}
      </span>
    </button>
  );
}
