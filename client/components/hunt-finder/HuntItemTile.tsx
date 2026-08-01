"use client";

import type { WikiItem } from "../../lib/wiki/WikiItem";
import { normalizeHuntName } from "../../lib/hunt-finder/normalizeHuntName";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface HuntItemTileProps {
  name: string;
  itemsByName: ReadonlyMap<string, WikiItem>;
  compact?: boolean;
}

export function HuntItemTile({
  name,
  itemsByName,
  compact = false,
}: HuntItemTileProps) {
  const item = itemsByName.get(normalizeHuntName(name));
  return (
    <span
      title={name}
      className={`ui-panel-inset flex min-w-0 items-center rounded-sm border border-ui-stone-light/15 bg-black/25 ${
        compact ? "size-12 justify-center" : "gap-2 px-2 py-1.5"
      }`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center">
        {item ? (
          <SpriteIcon spriteId={item.spriteId} scale={1} />
        ) : (
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/35 text-xs font-bold text-ui-muted"
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      {!compact && (
        <span className="min-w-0 truncate text-xs text-ui-text-bright capitalize">
          {name}
        </span>
      )}
    </span>
  );
}
