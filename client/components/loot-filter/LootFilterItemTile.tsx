"use client";

import type { LootFilterItem } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LOOT_TYPE_DRAG_MIME_TYPE } from "../../lib/loot-filter/lootTypeDragMimeType";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface LootFilterItemTileProps {
  readonly item: LootFilterItem;
  /** Marks the tile with the red cross: this type is on the ignore list. */
  readonly ignored: boolean;
  readonly onActivate: () => void;
}

/** One draggable item-type cell in either pane of the loot-filter window. */
export function LootFilterItemTile({
  item,
  ignored,
  onActivate,
}: LootFilterItemTileProps) {
  const { t } = useAppTranslation();
  return (
    <button
      type="button"
      draggable
      title={item.name}
      aria-label={
        ignored
          ? t("lootFilter.removeItem", { name: item.name })
          : t("lootFilter.addItem", { name: item.name })
      }
      aria-pressed={ignored}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          LOOT_TYPE_DRAG_MIME_TYPE,
          String(item.typeId),
        );
      }}
      onClick={onActivate}
      className="group relative flex size-16 items-center justify-center overflow-hidden rounded-lg border border-ui-stone/35 bg-black/30 shadow-inner shadow-black/55 transition-[border-color,background-color] hover:border-ui-gold/40 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:outline-none"
    >
      <SpriteIcon spriteId={item.spriteId} className={ignored ? "opacity-45" : undefined} />
      {ignored && (
        <span
          aria-hidden
          className="absolute top-0.5 right-0.5 text-sm leading-none font-bold text-red-400 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
        >
          ✕
        </span>
      )}
      {item.count !== undefined && item.count > 1 && (
        <span className="absolute right-0.5 bottom-0.5 rounded-md border border-ui-gold/15 bg-black/80 px-1.5 text-xs leading-4 font-semibold text-ui-text">
          {item.count}
        </span>
      )}
    </button>
  );
}
