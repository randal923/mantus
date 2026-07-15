"use client";

import { SpriteIcon } from "../inventory/SpriteIcon";
import { useAppTranslation } from "../../i18n/useAppTranslation";

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
  const { t } = useAppTranslation();

  return (
    <button
      type="button"
      title={t("character.button")}
      aria-label={t("character.openPanel", { name: characterName })}
      disabled={!onClick}
      onClick={onClick}
      className="group relative isolate flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ui-stone-light/30 bg-ui-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-2px_5px_rgba(0,0,0,0.65),0_4px_14px_rgba(0,0,0,0.3)] outline-none transition-[border-color,filter] duration-150 hover:border-ui-gold/55 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none sm:size-16"
    >
      <span
        aria-hidden
        className="texture-noise absolute inset-0 -z-10 opacity-[0.07] mix-blend-soft-light"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-linear-to-t from-ui-accent-deep/45 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-1 rounded-md border border-white/5"
      />
      <SpriteIcon
        spriteId={spriteId}
        scale={2}
        className="relative translate-y-1 transition-transform duration-150 group-hover:scale-105"
      />
      <span className="absolute right-1 bottom-1 flex min-w-5 items-center justify-center rounded-sm border border-ui-accent-light/35 bg-ui-accent-deep/90 px-1 py-0.5 font-display text-[10px] font-bold text-ui-text-bright">
        {level}
      </span>
    </button>
  );
}
