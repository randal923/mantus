"use client";

import type { ItemDisplayRarity } from "@tibia/protocol";
import type { ReactNode } from "react";
import type { LootFilterEntry } from "../../lib/loot-filter/LootFilterEntry";
import { LOOT_TYPE_DRAG_MIME_TYPE } from "../../lib/loot-filter/lootTypeDragMimeType";
import { parseLootFilterEntryKey } from "../../lib/loot-filter/parseLootFilterEntryKey";
import { LootFilterItemTile } from "./LootFilterItemTile";

interface LootFilterPaneProps {
  readonly title: string;
  readonly entries: ReadonlyArray<LootFilterEntry>;
  readonly emptyMessage: string;
  /** Rendered above the grid; the source pane puts its search box here. */
  readonly toolbar?: ReactNode;
  /** Whether a cell is already on the pick-up list, for the check badge. */
  readonly isSelected: (typeId: number, rarity?: ItemDisplayRarity) => boolean;
  readonly onActivateEntry: (
    typeId: number,
    rarity?: ItemDisplayRarity,
  ) => void;
  readonly onDropEntry: (typeId: number, rarity?: ItemDisplayRarity) => void;
}

/** One column of the loot-filter window: a titled, drop-target item grid. */
export function LootFilterPane({
  title,
  entries,
  emptyMessage,
  toolbar,
  isSelected,
  onActivateEntry,
  onDropEntry,
}: LootFilterPaneProps) {
  return (
    <section
      aria-label={title}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(LOOT_TYPE_DRAG_MIME_TYPE))
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(LOOT_TYPE_DRAG_MIME_TYPE);
        if (!raw) return;
        event.preventDefault();
        const parsed = parseLootFilterEntryKey(raw);
        if (parsed) onDropEntry(parsed.typeId, parsed.rarity);
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border border-ui-stone-light/15 bg-black/20 p-3"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3">
        <h3 className="font-display text-sm tracking-[0.1em] text-ui-gold uppercase">
          {title}
        </h3>
        <span className="text-xs font-semibold tabular-nums text-ui-muted">
          {entries.length}
        </span>
      </header>
      {toolbar}
      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ui-muted">
            {emptyMessage}
          </p>
        ) : (
          <ul className="flex flex-wrap content-start gap-2">
            {entries.map((entry) => (
              <li key={entry.key}>
                <LootFilterItemTile
                  entry={entry}
                  selected={isSelected(entry.typeId, entry.rarity)}
                  onActivate={() => onActivateEntry(entry.typeId, entry.rarity)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
