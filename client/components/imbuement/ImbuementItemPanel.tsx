"use client";

import type { ImbuementWindowStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { ImbuementPanel } from "./ImbuementPanel";
import { ImbuementSlotButton } from "./ImbuementSlotButton";

interface ImbuementItemPanelProps {
  window: ImbuementWindowStateMessage;
  itemName?: string;
  itemSpriteId?: number;
  selectedSlot: number | null;
  onSelectSlot: (slot: number) => void;
  onPickItem: () => void;
}

/**
 * Tibia's top panel: the chosen item beside its imbuement slots. With no item
 * picked yet this is the "Pick Item" prompt the shrine opens on.
 */
export function ImbuementItemPanel({
  window: windowState,
  itemName,
  itemSpriteId,
  selectedSlot,
  onSelectSlot,
  onPickItem,
}: ImbuementItemPanelProps) {
  const { t } = useAppTranslation();

  return (
    <ImbuementPanel title={t("imbuement.itemInformation")}>
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onPickItem}
          title={t("imbuement.pickItem")}
          className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-ui-stone-light/25 bg-black/45 transition-colors hover:border-ui-gold/50"
        >
          {itemSpriteId === undefined ? (
            <span className="px-1 text-center text-sm leading-tight text-ui-muted">
              {t("imbuement.pickItem")}
            </span>
          ) : (
            <SpriteIcon spriteId={itemSpriteId} scale={1.25} />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-base capitalize text-ui-text-bright">
            {itemName ?? t("imbuement.noItemPicked")}
          </span>
          {windowState.slotCount === 0 ? (
            <span className="text-sm text-ui-muted">
              {windowState.itemId === null
                ? t("imbuement.pickItemHint")
                : t("imbuement.noSlots")}
            </span>
          ) : (
            <div className="flex gap-2">
              {windowState.slots.map((slot) => (
                <ImbuementSlotButton
                  key={slot.slot}
                  slot={slot}
                  selected={slot.slot === selectedSlot}
                  onSelect={() => onSelectSlot(slot.slot)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ImbuementPanel>
  );
}
