"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { CharacterSummary } from "@tibia/protocol";
import { TrashIcon } from "../ui/TrashIcon";
import { OutfitPortrait } from "./OutfitPortrait";

interface CharacterListItemProps {
  character: CharacterSummary;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** Fired on double-click as a shortcut for select-and-confirm. */
  onConfirm: () => void;
  /** Renders a trash button on the row's right edge when provided. */
  onDelete?: () => void;
}

export function CharacterListItem({
  character,
  selected,
  disabled = false,
  onSelect,
  onConfirm,
  onDelete,
}: CharacterListItemProps) {
  const { t } = useAppTranslation();
  const vocation = t(`vocations.${character.vocation}.name`);
  const deleteLabel = t("characters.delete");

  return (
    <div
      className={`group flex w-full items-center gap-2 rounded-lg border pr-2 transition-[border-color,background-color,filter] duration-150 ${
        disabled ? "pointer-events-none opacity-40" : ""
      } ${
        selected
          ? "border-ui-gold/60 bg-ui-accent-deep/40"
          : "border-ui-stone-light/15 bg-black/20 hover:border-ui-stone-light/40 hover:brightness-110"
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onSelect}
        onDoubleClick={onConfirm}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60"
      >
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ui-stone-light/20 bg-black/35 p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
          <OutfitPortrait
            outfit={character.outfit}
            scale={1.75}
            className="transition-transform duration-150 group-hover:scale-105"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-display text-sm font-semibold tracking-wide text-ui-text-bright">
            {character.name}
          </span>
          <span className="text-sm text-ui-muted">
            {t("characters.level", { level: character.level, vocation })}
          </span>
        </span>
        <span
          aria-hidden
          className={`size-2 shrink-0 rotate-45 bg-ui-gold ${selected ? "" : "invisible"}`}
        />
      </button>
      {onDelete && (
        <button
          type="button"
          disabled={disabled}
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={onDelete}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-ui-muted outline-none transition-[color,border-color,background-color] duration-150 hover:border-ui-accent/60 hover:bg-ui-accent/15 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <TrashIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
