"use client";

import type { InventoryItem } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ImbuementItemPickerProps {
  /** Carried items with at least one imbuement slot. */
  items: ReadonlyArray<InventoryItem>;
  onPick: (itemId: string) => void;
  onCancel: () => void;
}

/**
 * Tibia's "Pick Item" chooser. The list is filtered from the inventory the
 * client already holds; the server re-checks the item when the window for it
 * is requested, so a doctored pick just gets rejected.
 */
export function ImbuementItemPicker({
  items,
  onPick,
  onCancel,
}: ImbuementItemPickerProps) {
  const { t } = useAppTranslation();

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="py-10 text-center text-base text-ui-muted">
          {t("imbuement.noImbuableItems")}
        </p>
      ) : (
        <ul className="ui-scrollbar grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-sm border border-ui-stone-light/15 bg-black/30 px-2 py-1.5 text-left transition-colors hover:border-ui-gold/50"
              >
                <SpriteIcon spriteId={item.spriteId} scale={1} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base capitalize text-ui-text-bright">
                    {item.name}
                  </span>
                  {item.imbuements && item.imbuements.length > 0 && (
                    <span className="block text-sm text-ui-gold">
                      {t("imbuement.activeCount", {
                        count: item.imbuements.length,
                      })}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="self-start text-sm text-ui-muted underline underline-offset-2 hover:text-ui-text"
      >
        {t("common.cancel")}
      </button>
    </div>
  );
}
