"use client";

import type { TrackerEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { CloseButton } from "../ui/CloseButton";
import { TrackerEntryRow } from "./TrackerEntryRow";

/** Rows rendered per scope; the rest is summarized to keep the panel light. */
const MAX_ROWS_PER_SCOPE = 12;

interface TrackerPanelProps {
  bestiaryEntries: ReadonlyArray<TrackerEntry>;
  bosstiaryEntries: ReadonlyArray<TrackerEntry>;
  onRemove: (scope: "bestiary" | "bosstiary", raceId: number) => void;
  onClose: () => void;
}

/**
 * Docked kill-tracker: the character's own tracked bestiary/bosstiary
 * races with live kill counts. All milestones are server-authored.
 */
export function TrackerPanel({
  bestiaryEntries,
  bosstiaryEntries,
  onRemove,
  onClose,
}: TrackerPanelProps) {
  const { t } = useAppTranslation();
  const sections = [
    { scope: "bestiary" as const, entries: bestiaryEntries },
    { scope: "bosstiary" as const, entries: bosstiaryEntries },
  ].filter((section) => section.entries.length > 0);

  return (
    <section
      aria-label={t("tracker.title")}
      className="ui-panel-frame pointer-events-auto flex max-h-full w-72 flex-col overflow-hidden p-3"
    >
      <header className="flex shrink-0 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-sm font-bold tracking-[0.14em] text-ui-text-bright uppercase">
          {t("tracker.title")}
        </h2>
        <CloseButton label={t("tracker.close")} onClick={onClose} />
      </header>
      <div className="ui-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {sections.length === 0 && (
          <p className="text-xs text-ui-muted">{t("tracker.empty")}</p>
        )}
        {sections.map((section) => (
          <div key={section.scope} className="mb-3 last:mb-0">
            <h3 className="mb-1 text-xs tracking-widest text-ui-gold uppercase">
              {t(`tracker.scope.${section.scope}`)}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {section.entries
                .slice(0, MAX_ROWS_PER_SCOPE)
                .map((entry) => (
                  <TrackerEntryRow
                    key={entry.raceId}
                    entry={entry}
                    onRemove={() => onRemove(section.scope, entry.raceId)}
                  />
                ))}
            </ul>
            {section.entries.length > MAX_ROWS_PER_SCOPE && (
              <p className="mt-1 text-center text-xs text-ui-muted">
                {t("tracker.more", {
                  extra: section.entries.length - MAX_ROWS_PER_SCOPE,
                })}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
