"use client";

import { SpriteIcon } from "../inventory/SpriteIcon";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { CharacterSummary } from "@tibia/protocol";
import { getOutfitPortraitSpriteId } from "./getOutfitPortraitSpriteId";

interface CharacterListItemProps {
  character: CharacterSummary;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** Fired on double-click as a shortcut for select-and-confirm. */
  onConfirm: () => void;
}

export function CharacterListItem({
  character,
  selected,
  disabled = false,
  onSelect,
  onConfirm,
}: CharacterListItemProps) {
  const { t } = useAppTranslation();
  const vocation = t(`vocations.${character.vocation}.name`);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onConfirm}
      className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-[border-color,background-color,filter] duration-150 focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-40 ${
        selected
          ? "border-ui-gold/60 bg-ui-accent-deep/40"
          : "border-ui-stone-light/15 bg-black/20 hover:border-ui-stone-light/40 hover:brightness-110"
      }`}
    >
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-stone-light/20 bg-black/35 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
        <SpriteIcon
          spriteId={getOutfitPortraitSpriteId(character.outfit.lookType)}
          scale={2}
          className="translate-y-1 transition-transform duration-150 group-hover:scale-105"
        />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-sm font-semibold tracking-wide text-ui-text-bright">
          {character.name}
        </span>
        <span className="text-xs text-ui-muted">
          {t("characters.level", { level: character.level, vocation })}
        </span>
      </span>
      {selected && <span aria-hidden className="size-2 shrink-0 rotate-45 bg-ui-gold" />}
    </button>
  );
}
