"use client";

import type { InventoryItem } from "@tibia/protocol";
import { formatImbuementDuration } from "../../lib/imbuement/formatImbuementDuration";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ImbuementIcon } from "../imbuement/ImbuementIcon";

interface ItemSlotImbuementsProps {
  imbuements: NonNullable<InventoryItem["imbuements"]>;
}

/**
 * The running imbuements on an inventory item, drawn as a strip of icons down
 * the slot's left edge the way Tibia marks imbued gear. Hovering one names it
 * and gives the time left.
 */
export function ItemSlotImbuements({ imbuements }: ItemSlotImbuementsProps) {
  const { t } = useAppTranslation();

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0.5 left-0.5 z-10 flex flex-col gap-0.5"
    >
      {imbuements.map((imbuement) => (
        <span
          key={imbuement.slot}
          className="pointer-events-auto rounded-xs border border-ui-gold/40 bg-black/70"
          title={t("imbuement.slotBadge", {
            name: imbuement.name,
            time: formatImbuementDuration(imbuement.remainingSeconds),
          })}
        >
          <ImbuementIcon iconId={imbuement.iconId} size={12} />
        </span>
      ))}
    </span>
  );
}
