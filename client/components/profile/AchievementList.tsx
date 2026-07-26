"use client";

import type { AchievementEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface AchievementListProps {
  achievements: ReadonlyArray<AchievementEntry>;
}

/**
 * Renders achievements exactly as projected by the server: granted first,
 * then by name. Ungranted secret entries stay hidden as "???" rows; the
 * public profile only ever carries granted entries, so nothing leaks there.
 */
export function AchievementList({ achievements }: AchievementListProps) {
  const { t } = useAppTranslation();
  const sorted = [...achievements].sort(
    (left, right) =>
      Number(right.granted) - Number(left.granted) ||
      left.name.localeCompare(right.name),
  );

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-ui-muted">{t("profile.noAchievements")}</p>
    );
  }

  return (
    <ul
      aria-label={t("profile.achievementsLabel")}
      className="space-y-2"
    >
      {sorted.map((achievement) => {
        const hidden = achievement.secret && !achievement.granted;
        return (
          <li
            key={achievement.achievementId}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              achievement.granted
                ? "border-ui-gold/25 bg-black/25"
                : "border-ui-stone-light/15 bg-black/15"
            }`}
          >
            <span
              aria-label={
                achievement.granted
                  ? t("profile.granted")
                  : t("profile.notGranted")
              }
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${
                achievement.granted
                  ? "border-ui-gold/50 bg-ui-gold/15 text-ui-gold"
                  : "border-ui-stone-light/25 bg-black/25 text-ui-muted/60"
              }`}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {achievement.granted ? (
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                ) : (
                  <>
                    <rect x="6" y="10.5" width="12" height="9" rx="1.5" />
                    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
                  </>
                )}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate font-display text-sm font-semibold ${
                  achievement.granted
                    ? "text-ui-text-bright"
                    : "text-ui-muted"
                }`}
              >
                {hidden ? t("profile.secretName") : achievement.name}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-ui-muted">
                {hidden
                  ? t("profile.secretDescription")
                  : achievement.description}
              </p>
            </div>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${
                  achievement.granted
                    ? "border-ui-gold/30 bg-ui-gold-deep/40 text-ui-text-bright"
                    : "border-ui-stone-light/20 bg-black/25 text-ui-muted"
                }`}
              >
                {t("profile.points", { points: achievement.points })}
              </span>
              <span
                aria-hidden
                className={`text-xs tracking-widest ${
                  achievement.granted ? "text-ui-gold" : "text-ui-muted/50"
                }`}
              >
                {"★".repeat(achievement.grade)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
