"use client";

import type { TrackerEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BestiaryKillProgressBar } from "../bestiary/BestiaryKillProgressBar";

interface TrackerEntryRowProps {
  entry: TrackerEntry;
  onRemove: () => void;
}

/** One tracked race with its server-authored kill milestones. */
export function TrackerEntryRow({ entry, onRemove }: TrackerEntryRowProps) {
  const { t } = useAppTranslation();

  return (
    <li className="rounded-sm border border-ui-stone-light/10 bg-black/25 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-ui-text-bright capitalize">
          {entry.name}
        </span>
        <button
          type="button"
          aria-label={t("tracker.remove", { name: entry.name })}
          title={t("tracker.remove", { name: entry.name })}
          onClick={onRemove}
          className="ui-button ui-button-secondary flex size-6 shrink-0 items-center justify-center rounded-sm border border-ui-stone-light/25 text-xs text-ui-muted transition-[color,border-color] hover:border-ui-gold/50 hover:text-ui-gold"
        >
          ×
        </button>
      </div>
      <div className="mt-1">
        <BestiaryKillProgressBar
          kills={entry.kills}
          firstUnlock={entry.firstUnlock}
          secondUnlock={entry.secondUnlock}
          toKill={entry.toKill}
        />
      </div>
    </li>
  );
}
