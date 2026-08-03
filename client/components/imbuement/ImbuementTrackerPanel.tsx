"use client";

import type { InventoryState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useImbuementBurnClock } from "../../hooks/useImbuementBurnClock";
import { collectTrackedEquipment } from "../../lib/imbuement/collectTrackedEquipment";
import { CloseButton } from "../ui/CloseButton";
import { ImbuementTrackerRow } from "./ImbuementTrackerRow";

interface ImbuementTrackerPanelProps {
  readonly inventory: InventoryState;
  /** Aggressive categories only burn in a fight outside a protection zone. */
  readonly inFight: boolean;
  readonly inProtectionZone: boolean;
  readonly onClose: () => void;
}

/**
 * Docked imbuement tracker: every equipped piece that has imbuement slots,
 * with the time left on each running imbuement.
 *
 * The durations are the server's; they refresh on every inventory push, which
 * decay checkpoints trigger once a minute. Between pushes the panel counts
 * down locally so the numbers move, exactly as decoration —
 * see `useImbuementBurnClock`.
 */
export function ImbuementTrackerPanel({
  inventory,
  inFight,
  inProtectionZone,
  onClose,
}: ImbuementTrackerPanelProps) {
  const { t } = useAppTranslation();
  const clock = useImbuementBurnClock(
    inventory.revision,
    inFight && !inProtectionZone,
  );
  const tracked = collectTrackedEquipment(inventory);

  return (
    <section
      aria-label={t("imbuementTracker.title")}
      className="ui-panel-frame pointer-events-auto flex max-h-full w-64 flex-col overflow-hidden p-3"
    >
      <header className="flex shrink-0 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-sm font-bold tracking-[0.14em] text-ui-text-bright uppercase">
          {t("imbuementTracker.title")}
        </h2>
        <CloseButton label={t("imbuementTracker.close")} onClick={onClose} />
      </header>
      <div className="ui-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {tracked.length === 0 ? (
          <p className="text-xs text-ui-muted">{t("imbuementTracker.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tracked.map((entry) => (
              <ImbuementTrackerRow
                key={entry.slot}
                entry={entry}
                clock={clock}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
