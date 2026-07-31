"use client";

import { IMBUEMENT_RULES, type ImbuementSlotState } from "@tibia/protocol";
import { formatImbuementDuration } from "../../lib/imbuement/formatImbuementDuration";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementPanel } from "./ImbuementPanel";

interface ImbuementClearPanelProps {
  slot: ImbuementSlotState;
  clearCostGold: number;
  pending: boolean;
  onClear: () => void;
}

/**
 * Tibia's action panel for an occupied slot: how much of the imbuement is
 * left, and the flat price to strip it out.
 *
 * The time shown is the server's, not a local countdown. Decay is
 * conditional — aggressive imbuements only burn while their wearer is
 * fighting outside a protection zone — so a clock ticking in the client would
 * drift away from the truth within seconds of opening the window.
 */
export function ImbuementClearPanel({
  slot,
  clearCostGold,
  pending,
  onClear,
}: ImbuementClearPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const label = `${slot.baseName ?? ""} ${slot.name ?? ""}`.trim();
  const remainingSeconds = slot.remainingSeconds;
  const percent = Math.min(
    100,
    (remainingSeconds / IMBUEMENT_RULES.durationSeconds) * 100,
  );

  return (
    <ImbuementPanel title={t("imbuement.clearTitle", { name: label })}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-ui-stone-light/25 bg-black/45">
          <ImbuementIcon iconId={slot.iconId ?? 0} size={44} />
        </span>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-sm text-ui-muted">
            {t("imbuement.timeRemaining")}
          </span>
          <div
            role="progressbar"
            aria-label={t("imbuement.timeRemaining")}
            aria-valuemin={0}
            aria-valuemax={IMBUEMENT_RULES.durationSeconds}
            aria-valuenow={remainingSeconds}
            className="relative h-5 overflow-hidden rounded-sm border border-ui-stone-light/15 bg-black/45"
          >
            <div
              className="h-full bg-ui-gold-deep/80"
              style={{ width: `${percent}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-sm leading-none tabular-nums text-ui-text-bright [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
              {formatImbuementDuration(remainingSeconds)}
            </span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
          <span className="text-base text-ui-gold tabular-nums">
            {t("imbuement.price", {
              gold: clearCostGold.toLocaleString(language),
            })}
          </span>
          <Button variant="danger" disabled={pending} onClick={onClear}>
            {t("imbuement.clearAction")}
          </Button>
        </div>
      </div>
    </ImbuementPanel>
  );
}
