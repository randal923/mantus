"use client";

import type { CharacterOutfit } from "@tibia/protocol";
import { OutfitPortrait } from "../characters/OutfitPortrait";

/** Sprite box side (px) each thumbnail is fitted into. */
const THUMBNAIL_FIT = 64;

interface OutfitPickerCellProps {
  outfit: CharacterOutfit;
  label: string;
  selected: boolean;
  /** Extra detail shown on hover, e.g. a mount's speed bonus. */
  title?: string;
  onSelect: () => void;
}

/** One sprite tile in the outfit/mount picker: thumbnail above its name. */
export function OutfitPickerCell({
  outfit,
  label,
  selected,
  title,
  onSelect,
}: OutfitPickerCellProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title}
      onClick={onSelect}
      className={`flex w-full flex-col items-center gap-1 rounded-md border p-2 transition-[border-color,background-color] ${
        selected
          ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
          : "border-ui-stone-light/25 hover:border-ui-gold/50"
      }`}
    >
      <span className="flex h-16 w-full items-center justify-center">
        <OutfitPortrait outfit={outfit} fit={THUMBNAIL_FIT} />
      </span>
      <span className="w-full truncate text-center text-xs">{label}</span>
    </button>
  );
}
