"use client";

import type { ProfileStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { summarizeProfileProgress } from "../../lib/profile/summarizeProfileProgress";
import { AchievementList } from "../profile/AchievementList";

interface WikiCharacterAchievementsProps {
  profile: ProfileStateMessage | null;
}

/**
 * Read-only view over the own profile projection: achievements plus the
 * granted titles. Title selection stays in the Profile window.
 */
export function WikiCharacterAchievements({
  profile,
}: WikiCharacterAchievementsProps) {
  const { t } = useAppTranslation();
  if (!profile) {
    return (
      <p role="status" className="py-12 text-center text-sm text-ui-muted">
        {t("profile.loading")}
      </p>
    );
  }
  const summary = summarizeProfileProgress(profile.achievements);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("profile.tabs.achievements")}
          </h4>
          <span className="rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
            {t("profile.pointsLabel")}: {profile.points}
          </span>
          <span className="text-sm tabular-nums text-ui-muted">
            {t("profile.progress", {
              granted: summary.grantedCount,
              total: summary.totalCount,
            })}
          </span>
        </div>
        <AchievementList achievements={profile.achievements} />
      </section>

      <section className="min-w-0">
        <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {t("profile.tabs.titles")}
        </h4>
        <p className="mt-1 text-xs text-ui-muted">
          {t("wiki.character.achievements.titlesHint")}
        </p>
        {profile.titles.length === 0 ? (
          <p className="mt-3 text-sm text-ui-muted">
            {t("wiki.character.achievements.noTitles")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {profile.titles.map((title) => (
              <li
                key={title.titleId}
                className={`flex items-center gap-2 rounded-lg border p-3 ${
                  title.granted
                    ? "border-ui-stone/25 bg-black/30"
                    : "border-ui-stone-light/15 bg-black/15 opacity-60"
                }`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    title.granted ? "text-ui-text-bright" : "text-ui-muted"
                  }`}
                >
                  {title.name}
                </span>
                {title.titleId === profile.selectedTitle && (
                  <span className="shrink-0 rounded-sm border border-ui-gold/40 bg-ui-gold-deep/40 px-1.5 py-0.5 text-xs tracking-wide text-ui-gold uppercase">
                    {t("wiki.character.achievements.selected")}
                  </span>
                )}
                {!title.granted && (
                  <span className="shrink-0 rounded-sm border border-ui-stone-light/20 bg-black/25 px-1.5 py-0.5 text-xs tracking-wide text-ui-muted uppercase">
                    {t("profile.titlePicker.locked")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
