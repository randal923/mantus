"use client";

import { useMemo, useState } from "react";
import type { ImbuementWindowStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Modal } from "../ui/Modal";
import { ImbuementOptionRow } from "./ImbuementOptionRow";
import { ImbuementSlotCard } from "./ImbuementSlotCard";

interface ImbuementModalProps {
  window: ImbuementWindowStateMessage | null;
  /** Display data for the item, resolved by the caller. */
  itemName?: string;
  itemSpriteId?: number;
  pending: boolean;
  error: string | null;
  onApply: (slot: number, imbuementId: number) => void;
  onClear: (slot: number) => void;
  onClose: () => void;
}

/**
 * Imbuement shrine window for one carried item. Slots, options, prices,
 * and material availability are all server-composed projections.
 */
export function ImbuementModal({
  window: windowState,
  itemName,
  itemSpriteId,
  pending,
  error,
  onApply,
  onClear,
  onClose,
}: ImbuementModalProps) {
  const { t } = useAppTranslation();
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const emptySlots = useMemo(
    () =>
      (windowState?.slots ?? []).filter((slot) => slot.imbuementId === null),
    [windowState],
  );
  const activeSlot =
    selectedSlot !== null &&
    emptySlots.some((slot) => slot.slot === selectedSlot)
      ? selectedSlot
      : (emptySlots[0]?.slot ?? null);
  const optionsByCategory = useMemo(() => {
    const grouped = new Map<
      string,
      NonNullable<typeof windowState>["options"]
    >();
    for (const option of windowState?.options ?? []) {
      grouped.set(option.categorySlug, [
        ...(grouped.get(option.categorySlug) ?? []),
        option,
      ]);
    }
    return [...grouped.entries()];
  }, [windowState]);

  return (
    <Modal title={t("imbuement.title")} size="wide" onClose={onClose}>
      {!windowState ? (
        <p className="py-10 text-center text-sm text-ui-muted">
          {t("imbuement.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-sm border border-ui-stone-light/15 bg-black/25 px-3 py-2">
            {itemSpriteId !== undefined && (
              <SpriteIcon spriteId={itemSpriteId} scale={1.25} />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm text-ui-text-bright capitalize">
                {itemName ?? t("imbuement.item")}
              </span>
              <span className="block text-xs text-ui-muted">
                {t("imbuement.slotCount", { slots: windowState.slotCount })}
              </span>
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-sm text-ui-accent-light"
            >
              {error}
            </p>
          )}

          {windowState.slotCount === 0 ? (
            <p className="py-6 text-center text-sm text-ui-muted">
              {t("imbuement.noSlots")}
            </p>
          ) : (
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${windowState.slotCount}, minmax(0, 1fr))`,
              }}
            >
              {windowState.slots.map((slot) => (
                <ImbuementSlotCard
                  key={slot.slot}
                  slot={slot}
                  selected={slot.slot === activeSlot}
                  clearCostGold={windowState.removeCostGold}
                  pending={pending}
                  onSelect={() => setSelectedSlot(slot.slot)}
                  onClear={() => onClear(slot.slot)}
                />
              ))}
            </div>
          )}

          {activeSlot !== null && (
            <section>
              <h3 className="mb-2 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
                {t("imbuement.optionsFor", { slot: activeSlot + 1 })}
              </h3>
              {optionsByCategory.length === 0 && (
                <p className="py-6 text-center text-sm text-ui-muted">
                  {t("imbuement.noOptions")}
                </p>
              )}
              {optionsByCategory.map(([category, options]) => (
                <div key={category} className="mb-3 last:mb-0">
                  <h4 className="mb-1.5 text-xs tracking-widest text-ui-muted uppercase">
                    {category}
                  </h4>
                  <ul className="flex flex-col gap-2">
                    {options.map((option) => (
                      <ImbuementOptionRow
                        key={option.imbuementId}
                        option={option}
                        pending={pending}
                        onApply={() =>
                          onApply(activeSlot, option.imbuementId)
                        }
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
