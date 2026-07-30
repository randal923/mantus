"use client";

import type { ReactNode } from "react";
import type { LootFilterItem } from "@tibia/protocol";
import { LOOT_TYPE_DRAG_MIME_TYPE } from "../../lib/loot-filter/lootTypeDragMimeType";
import { LootFilterItemTile } from "./LootFilterItemTile";

interface LootFilterPaneProps {
  readonly title: string;
  readonly items: ReadonlyArray<LootFilterItem>;
  /** Type ids currently on the ignore list, for the red-cross badge. */
  readonly ignoredTypeIds: ReadonlySet<number>;
  readonly emptyMessage: string;
  /** Rendered above the grid; the carried pane puts its search box here. */
  readonly toolbar?: ReactNode;
  readonly onActivateItem: (typeId: number) => void;
  readonly onDropItem: (typeId: number) => void;
}

/** One column of the loot-filter window: a titled, drop-target item grid. */
export function LootFilterPane({
  title,
  items,
  ignoredTypeIds,
  emptyMessage,
  toolbar,
  onActivateItem,
  onDropItem,
}: LootFilterPaneProps) {
  return (
    <section
      aria-label={title}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(LOOT_TYPE_DRAG_MIME_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(LOOT_TYPE_DRAG_MIME_TYPE);
        if (!raw) return;
        event.preventDefault();
        const typeId = Number.parseInt(raw, 10);
        if (Number.isInteger(typeId) && typeId > 0) onDropItem(typeId);
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-lg border border-ui-stone-light/15 bg-black/20 p-3"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-3">
        <h3 className="font-display text-sm tracking-[0.1em] text-ui-gold uppercase">
          {title}
        </h3>
        <span className="text-xs font-semibold tabular-nums text-ui-muted">
          {items.length}
        </span>
      </header>
      {toolbar}
      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ui-muted">
            {emptyMessage}
          </p>
        ) : (
          <ul className="flex flex-wrap content-start gap-2">
            {items.map((item) => (
              <li key={item.typeId}>
                <LootFilterItemTile
                  item={item}
                  ignored={ignoredTypeIds.has(item.typeId)}
                  onActivate={() => onActivateItem(item.typeId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
