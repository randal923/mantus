"use client";

import type { DailyRewardHistoryEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface DailyRewardHistoryPanelProps {
  /** Null until the server answers the request. */
  entries: ReadonlyArray<DailyRewardHistoryEntry> | null;
}

/**
 * The History panel: this character's own last claims, newest first. Each
 * entry is rebuilt from the parts the server stored rather than a prebuilt
 * sentence, so it reads in the player's language.
 */
export function DailyRewardHistoryPanel({
  entries,
}: DailyRewardHistoryPanelProps) {
  const { t } = useAppTranslation();

  if (entries === null) {
    return (
      <p className="p-3 text-sm text-ui-muted">{t("dailyRewards.loading")}</p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="p-3 text-sm text-ui-muted">
        {t("dailyRewards.historyEmpty")}
      </p>
    );
  }

  return (
    <ul className="ui-scrollbar flex max-h-80 flex-col gap-1 overflow-y-auto p-1">
      {entries.map((entry) => (
        <li
          key={`${entry.claimedAtMs}:${entry.rewardDay}`}
          className="rounded-sm border border-ui-stone-light/15 bg-black/25 px-2 py-1.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-ui-text-bright">
              {t("dailyRewards.day", { day: entry.rewardDay })}
            </span>
            <span className="text-xs text-ui-muted">
              {new Date(entry.claimedAtMs).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-ui-text/85">
            {entry.items.length > 0
              ? entry.items
                  .map((item) => `${item.count}x ${item.name}`)
                  .join(", ")
              : entry.kind === "xp-boost"
                ? t("dailyRewards.boostToday", { minutes: entry.allowance })
                : t("dailyRewards.wildcardsToday", {
                    count: entry.allowance,
                  })}
          </p>
        </li>
      ))}
    </ul>
  );
}
