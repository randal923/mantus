"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatImbuementDuration } from "../../lib/imbuement/formatImbuementDuration";
import { imbuementTrackerTimeOf } from "../../lib/imbuement/imbuementTrackerTimeOf";
import { ImbuementIcon } from "./ImbuementIcon";

interface ImbuementTrackerSlotProps {
  /** Null renders the empty-slot placeholder, like OTClient's inactive slot. */
  readonly imbuement: {
    readonly name: string;
    readonly iconId: number;
    readonly remainingSeconds: number;
  } | null;
}

const TONE_CLASS = {
  expired: "text-red-400",
  urgent: "text-red-400",
  soon: "text-yellow-300",
  normal: "text-ui-text-bright",
} as const;

/** One imbuement slot on a tracked piece: its icon with the time left over it. */
export function ImbuementTrackerSlot({ imbuement }: ImbuementTrackerSlotProps) {
  const { t } = useAppTranslation();

  if (!imbuement) {
    return (
      <span
        title={t("imbuement.emptySlot")}
        className="flex size-8 shrink-0 items-center justify-center rounded-xs border border-dashed border-ui-stone-light/25 bg-black/30"
      >
        <span aria-hidden className="text-sm text-ui-muted/50">
          ×
        </span>
      </span>
    );
  }

  const { text, tone } = imbuementTrackerTimeOf(imbuement.remainingSeconds);
  return (
    <span
      title={t("imbuement.slotBadge", {
        name: imbuement.name,
        time: formatImbuementDuration(imbuement.remainingSeconds),
      })}
      className="relative flex size-8 shrink-0 items-center justify-center rounded-xs border border-ui-gold/30 bg-black/50"
    >
      <ImbuementIcon iconId={imbuement.iconId} size={26} />
      <span
        className={`pointer-events-none absolute inset-x-0 -bottom-0.5 text-center text-[0.625rem] leading-none font-bold [text-shadow:0_1px_2px_#000,0_0_2px_#000] ${TONE_CLASS[tone]}`}
      >
        {text}
      </span>
    </span>
  );
}
