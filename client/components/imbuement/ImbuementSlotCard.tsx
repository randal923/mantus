"use client";

import type { ImbuementSlotState } from "@tibia/protocol";
import { formatImbuementTime } from "../../lib/imbuement/formatImbuementTime";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface ImbuementSlotCardProps {
  slot: ImbuementSlotState;
  selected: boolean;
  clearCostGold: number;
  pending: boolean;
  onSelect: () => void;
  onClear: () => void;
}

/** One imbuement slot: running imbuement with time left, or empty. */
export function ImbuementSlotCard({
  slot,
  selected,
  clearCostGold,
  pending,
  onSelect,
  onClear,
}: ImbuementSlotCardProps) {
  const { t } = useAppTranslation();
  const occupied = slot.imbuementId !== null;

  return (
    <div
      className={`flex min-h-32 flex-col rounded-sm border p-3 transition-[border-color] ${
        selected
          ? "border-ui-gold/60 bg-ui-gold/5"
          : "border-ui-stone-light/15 bg-black/25"
      }`}
    >
      <h4 className="text-xs tracking-widest text-ui-gold uppercase">
        {t("imbuement.slotLabel", { slot: slot.slot + 1 })}
      </h4>
      {occupied ? (
        <div className="mt-1 flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-ui-text-bright">
            {slot.name}
          </span>
          {slot.baseName && (
            <span className="text-xs text-ui-muted">{slot.baseName}</span>
          )}
          <span className="mt-1 text-xs text-ui-gold">
            {t("imbuement.timeLeft", {
              time: formatImbuementTime(slot.remainingSeconds),
            })}
          </span>
          <span className="mt-auto pt-2">
            <Button size="sm" variant="danger" disabled={pending} onClick={onClear}>
              {t("imbuement.clear", {
                gold: clearCostGold.toLocaleString(),
              })}
            </Button>
          </span>
        </div>
      ) : (
        <div className="mt-1 flex flex-1 flex-col items-start justify-between gap-2">
          <span className="text-sm text-ui-muted">
            {t("imbuement.emptySlot")}
          </span>
          <Button size="sm" disabled={pending} onClick={onSelect}>
            {selected ? t("imbuement.selected") : t("imbuement.choose")}
          </Button>
        </div>
      )}
    </div>
  );
}
