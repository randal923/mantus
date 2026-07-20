"use client";

import { BOSSTIARY_MILESTONES, type BosstiaryEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";

interface BosstiaryCardProps {
  entry: BosstiaryEntry;
}

/** One boss card: animated outfit, category, kill count, milestone stars. */
export function BosstiaryCard({ entry }: BosstiaryCardProps) {
  const { t } = useAppTranslation();
  const locked = entry.kills === 0;
  const milestones = BOSSTIARY_MILESTONES[entry.category];
  const nextMilestone = milestones.find((m) => entry.kills < m.kills);

  return (
    <div className="ui-panel-inset flex flex-col items-center gap-1.5 rounded-sm border border-ui-stone-light/20 p-3">
      <span className="flex h-20 items-center justify-center">
        <AnimatedOutfit outfit={entry.outfit} fit={80} silhouette={locked} />
      </span>
      <span className="w-full truncate text-center text-xs text-ui-text-bright">
        {locked ? t("bosstiary.unknown") : entry.name}
      </span>
      <span className="text-[10px] tracking-widest text-ui-muted uppercase">
        {t(`bosstiary.category.${entry.category}`)}
      </span>
      <span
        aria-label={t("bosstiary.milestones")}
        title={
          nextMilestone
            ? `${entry.kills.toLocaleString()} / ${nextMilestone.kills.toLocaleString()}`
            : entry.kills.toLocaleString()
        }
        className="text-sm tracking-widest"
      >
        {milestones.map((milestone) => (
          <span
            key={milestone.kills}
            className={
              entry.kills >= milestone.kills
                ? "text-yellow-400"
                : "text-ui-stone-light/40"
            }
          >
            ★
          </span>
        ))}
      </span>
      <span className="text-xs text-ui-muted">
        {t("bosstiary.kills", { kills: entry.kills.toLocaleString() })}
      </span>
    </div>
  );
}
