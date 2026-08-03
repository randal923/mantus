"use client";

import {
  IMBUEMENT_RULES,
  type ImbuementWindowStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { ImbuableItem } from "../../lib/imbuement/collectImbuableItems";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementPanel } from "./ImbuementPanel";
import { ImbuementSlotButton } from "./ImbuementSlotButton";

interface ImbuementItemPanelProps {
  window: ImbuementWindowStateMessage;
  items: ReadonlyArray<ImbuableItem>;
  selectedSlot: number | null;
  onSelectItem: (itemId: string) => void;
  onSelectSlot: (slot: number) => void;
}

/** Carried imbuable items beside the selected item's imbuement slots. */
export function ImbuementItemPanel({
  window: windowState,
  items,
  selectedSlot,
  onSelectItem,
  onSelectSlot,
}: ImbuementItemPanelProps) {
  const { t } = useAppTranslation();

  return (
    <ImbuementPanel title={t("imbuement.itemInformation")}>
      <div className="grid min-h-56 min-w-0 md:grid-cols-2">
        <div className="flex min-h-56 min-w-0 flex-col bg-black/20 p-3">
          <h4 className="mb-2 font-display text-sm font-semibold tracking-wide text-ui-gold uppercase">
            {t("imbuement.pickItemToImbue")}
          </h4>
          {items.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-ui-muted">
              {t("imbuement.noImbuableItems")}
            </p>
          ) : (
            <ul className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,4rem)] content-start gap-2">
              {items.map(({ item, equipped }) => {
                const selected = item.id === windowState.itemId;

                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={selected}
                      // The badge's own text would otherwise become the
                      // button's accessible name.
                      aria-label={
                        equipped
                          ? `${item.name} — ${t("imbuement.equipped")}`
                          : item.name
                      }
                      title={item.name}
                      onClick={() => onSelectItem(item.id)}
                      className={`relative flex size-16 items-center justify-center overflow-hidden border text-center transition-colors ${
                        selected
                          ? "border-ui-gold/70 bg-ui-gold/10"
                          : "border-ui-stone-light/15 bg-black/35 hover:border-ui-stone-light/45"
                      }`}
                    >
                      <span className="flex size-10 items-center justify-center">
                        <SpriteIcon spriteId={item.spriteId} scale={1.5} />
                      </span>
                      {equipped && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-0.5 text-xs leading-tight text-ui-gold">
                          {t("imbuement.equipped")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex min-w-0 flex-col items-center justify-center gap-4 border-t border-ui-stone-light/15 bg-black/20 p-4 sm:flex-row sm:gap-6 md:border-t-0 md:border-l">
          {windowState.slotCount === 0 ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
              <span className="font-display text-base font-semibold text-ui-text-bright">
                {windowState.itemId === null
                  ? t("imbuement.selectSlot")
                  : t("imbuement.noSlots")}
              </span>
              {windowState.itemId === null && (
                <div className="flex gap-2 sm:gap-3">
                  {Array.from(
                    { length: IMBUEMENT_RULES.maxSlots },
                    (_, slot) => (
                      <span
                        key={slot}
                        aria-hidden
                        className="flex size-16 items-center justify-center border border-ui-stone-light/10 bg-black/30 opacity-45 sm:size-20"
                      >
                        <ImbuementIcon iconId={0} size={52} />
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
              <span className="font-display text-base font-semibold text-ui-text-bright">
                {t("imbuement.selectSlot")}
              </span>
              <div className="flex gap-2 sm:gap-3">
                {windowState.slots.map((slot) => (
                  <ImbuementSlotButton
                    key={slot.slot}
                    slot={slot}
                    selected={slot.slot === selectedSlot}
                    onSelect={() => onSelectSlot(slot.slot)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ImbuementPanel>
  );
}
