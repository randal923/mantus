"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { LootFilterEntry } from "../../lib/loot-filter/LootFilterEntry";
import { LOOT_TYPE_DRAG_MIME_TYPE } from "../../lib/loot-filter/lootTypeDragMimeType";
import { ItemCell } from "../inventory/ItemCell";

interface LootFilterItemTileProps {
  readonly entry: LootFilterEntry;
  /** Marks the tile with the check badge: this cell is on the pick-up list. */
  readonly selected: boolean;
  readonly onActivate: () => void;
}

/** One draggable cell of the loot-filter window: an item type at one grade. */
export function LootFilterItemTile({
  entry,
  selected,
  onActivate,
}: LootFilterItemTileProps) {
  const { t } = useAppTranslation();
  // The grade is spelled out for screen readers and drawn as the ring colour
  // for everyone else; the tooltip names it in full on hover.
  const label = entry.rarity
    ? `${t(`itemTooltip.rarity.${entry.rarity}`)} ${entry.name}`
    : entry.name;

  return (
    <ItemCell
      spriteId={entry.spriteId}
      clientId={entry.typeId}
      count={entry.count}
      tooltip={entry.tooltip}
      rarity={entry.rarity}
      label={
        selected
          ? t("lootFilter.removeItem", { name: label })
          : t("lootFilter.addItem", { name: label })
      }
      pressed={selected}
      dimmed={!selected}
      marker={
        selected ? <span className="text-ui-success-light">✓</span> : undefined
      }
      draggable
      onClick={onActivate}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(LOOT_TYPE_DRAG_MIME_TYPE, entry.key);
      }}
    />
  );
}
