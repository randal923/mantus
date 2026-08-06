"use client";

import type { BestiaryLootEntry } from "@tibia/protocol";
import { ItemCell } from "../inventory/ItemCell";

interface BestiaryLootItemProps {
  entry: BestiaryLootEntry;
  borderClassName: string;
}

/** One bestiary drop; the ring is its drop chance, not the item's grade. */
export function BestiaryLootItem({
  entry,
  borderClassName,
}: BestiaryLootItemProps) {
  return (
    <li>
      <ItemCell
        spriteId={entry.spriteId}
        tooltip={entry.tooltip}
        borderClassName={borderClassName}
        size="compact"
        label={entry.tooltip.name}
      />
    </li>
  );
}
