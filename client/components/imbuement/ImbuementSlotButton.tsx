"use client";

import type { ImbuementSlotState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ImbuementIcon } from "./ImbuementIcon";

interface ImbuementSlotButtonProps {
  slot: ImbuementSlotState;
  selected: boolean;
  onSelect: () => void;
}

/**
 * One of the item's three imbuement slots, drawn as Tibia draws them: the
 * running imbuement's icon, or the empty-slot placeholder. Selecting a slot
 * is what switches the panel below between imbuing and clearing.
 */
export function ImbuementSlotButton({
  slot,
  selected,
  onSelect,
}: ImbuementSlotButtonProps) {
  const { t } = useAppTranslation();
  const occupied = slot.imbuementId !== null;
  const label = occupied
    ? `${slot.baseName ?? ""} ${slot.name ?? ""}`.trim()
    : t("imbuement.emptySlot");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
      aria-label={t("imbuement.slotLabel", { slot: slot.slot + 1 })}
      className={`flex size-16 shrink-0 items-center justify-center border bg-black/45 shadow-[inset_0_0_0_3px_rgba(255,255,255,0.025)] transition-[border-color,background-color] sm:size-20 ${
        selected
          ? "border-ui-gold/70 bg-ui-gold/10"
          : "border-ui-stone-light/20 hover:border-ui-stone-light/45"
      }`}
    >
      <ImbuementIcon iconId={slot.iconId ?? 0} size={52} />
    </button>
  );
}
