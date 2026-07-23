"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";

interface BestiaryKillProgressBarProps {
  kills: number;
  firstUnlock: number;
  secondUnlock: number;
  toKill: number;
}

/** Three-segment unlock bar (counter → stats → resistances → complete). */
export function BestiaryKillProgressBar({
  kills,
  firstUnlock,
  secondUnlock,
  toKill,
}: BestiaryKillProgressBarProps) {
  const { t } = useAppTranslation();
  const segments = [
    { from: 0, to: firstUnlock },
    { from: firstUnlock, to: secondUnlock },
    { from: secondUnlock, to: toKill },
  ];
  const complete = kills >= toKill;
  const nextUnlock =
    kills < firstUnlock ? firstUnlock : kills < secondUnlock ? secondUnlock : toKill;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ui-muted">{t("bestiary.totalKills")}</span>
        <span className="text-base font-medium text-ui-gold">
          {kills.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        {segments.map((segment) => {
          const span = segment.to - segment.from;
          const filled = Math.min(
            1,
            Math.max(0, (kills - segment.from) / span),
          );
          return (
            <div
              key={segment.to}
              title={`${Math.min(kills, segment.to).toLocaleString()} / ${segment.to.toLocaleString()}`}
              className="h-2 flex-1 overflow-hidden rounded-xs border border-ui-stone-light/30 bg-black/40"
            >
              <div
                className={`h-full ${complete ? "bg-ui-gold" : "bg-amber-600"}`}
                style={{ width: `${filled * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-center text-xs text-ui-muted">
        {complete
          ? t("bestiary.completed")
          : t("bestiary.nextUnlock", {
              current: kills.toLocaleString(),
              kills: nextUnlock.toLocaleString(),
            })}
      </p>
    </div>
  );
}
