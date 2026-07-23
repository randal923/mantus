import type {
  ActionBar,
  InventoryItem,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { formatActionBarHotkey } from "../../lib/hotkeys/formatActionBarHotkey";
import { getActionBarActionName } from "../../lib/action-bar/getActionBarActionName";
import { ActionBarActionIcon } from "./ActionBarActionIcon";

interface ActionBarSlotStripProps {
  readonly actionBar: ActionBar;
  readonly selectedSlot: number;
  readonly spells: ReadonlyArray<SpellCatalogEntry>;
  readonly items: ReadonlyArray<InventoryItem>;
  readonly onSelect: (slotIndex: number) => void;
}

export function ActionBarSlotStrip({
  actionBar,
  selectedSlot,
  spells,
  items,
  onSelect,
}: ActionBarSlotStripProps) {
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-ui-stone-light/15 bg-black/25 p-2">
      <div className="mx-auto grid w-max grid-cols-9 gap-1">
        {actionBar.map((slot, index) => {
          const selected = selectedSlot === index;
          const name = getActionBarActionName(slot.action, spells, items);
          return (
            <button
              key={index}
              type="button"
              title={`${index + 1}. ${name}`}
              aria-label={`Action button ${index + 1}: ${name}`}
              aria-pressed={selected}
              onClick={() => onSelect(index)}
              className={`relative flex size-16 items-end justify-center overflow-hidden rounded border pb-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                selected
                  ? "border-ui-gold/80 bg-ui-gold/15 text-ui-text-bright"
                  : "border-ui-stone-light/20 bg-ui-panel-deep/70 text-ui-muted hover:border-ui-gold/45"
              }`}
            >
              <kbd className="absolute top-0.5 left-1 max-w-[calc(100%-0.5rem)] truncate text-xs font-bold text-ui-gold">
                {formatActionBarHotkey(slot.hotkey) || "—"}
              </kbd>
              <ActionBarActionIcon
                action={slot.action}
                items={items}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
