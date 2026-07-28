"use client";

import type { CharacterOutfit } from "@tibia/protocol";
import { OutfitPickerCell } from "./OutfitPickerCell";

export interface OutfitPickerEntry {
  /** Stable domain id: a look type for outfits, a mount id for mounts. */
  readonly key: string;
  readonly outfit: CharacterOutfit;
  readonly label: string;
  readonly title?: string;
  readonly selected: boolean;
}

interface OutfitPickerGridProps {
  label: string;
  entries: ReadonlyArray<OutfitPickerEntry>;
  emptyLabel: string;
  onSelect: (key: string) => void;
}

/** Scrollable sprite grid of entitled outfits or mounts. */
export function OutfitPickerGrid({
  label,
  entries,
  emptyLabel,
  onSelect,
}: OutfitPickerGridProps) {
  if (entries.length === 0) {
    return <p className="p-2 text-xs text-ui-muted">{emptyLabel}</p>;
  }
  return (
    <ul
      aria-label={label}
      className="ui-scrollbar grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1"
    >
      {entries.map((entry) => (
        <li key={entry.key}>
          <OutfitPickerCell
            outfit={entry.outfit}
            label={entry.label}
            title={entry.title}
            selected={entry.selected}
            onSelect={() => onSelect(entry.key)}
          />
        </li>
      ))}
    </ul>
  );
}
