"use client";

import { BOSSTIARY_MILESTONES, type BosstiaryEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { BosstiaryCategoryIcon } from "./BosstiaryCategoryIcon";
import { BosstiaryMilestoneIcon } from "./BosstiaryMilestoneIcon";

const MILESTONE_METALS = ["bronze", "silver", "gold"] as const;

interface BosstiaryCardProps {
  entry: BosstiaryEntry;
  onSelect: (raceId: number) => void;
}

/** One boss card: animated outfit, category, kill count, milestone stars. */
export function BosstiaryCard({ entry, onSelect }: BosstiaryCardProps) {
  const { t } = useAppTranslation();
  const milestones = BOSSTIARY_MILESTONES[entry.category];
  const nextMilestone = milestones.find((m) => entry.kills < m.kills);
  const finalMilestone = milestones[milestones.length - 1];
  const progress = Math.min(100, (entry.kills / finalMilestone.kills) * 100);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.raceId)}
      className="ui-panel-inset group flex min-h-56 w-full flex-col overflow-hidden rounded-sm border border-ui-stone-light/15 text-left transition-colors hover:border-ui-gold/55 focus-visible:border-ui-gold focus-visible:outline-none"
    >
      <header className="flex items-center gap-2 border-b border-ui-stone-light/10 bg-ui-panel-light/35 px-3 py-2">
        <BosstiaryCategoryIcon category={entry.category} />
        <span className="min-w-0 flex-1 truncate text-center font-display text-xs font-bold tracking-wide text-ui-text-bright capitalize group-hover:text-ui-gold">
          {entry.name}
        </span>
      </header>
      <span className="flex h-28 items-center justify-center">
        <AnimatedOutfit outfit={entry.outfit} fit={108} />
      </span>
      <div className="mt-auto px-4 pb-4">
        <span className="block text-center text-[9px] tracking-widest text-ui-muted uppercase">
          {t("bestiary.totalKills")}
        </span>
        <span className="mt-1 block rounded-sm border border-ui-stone-light/15 bg-black/50 py-1 text-center text-sm font-bold text-ui-text-bright">
          {entry.kills.toLocaleString()}
        </span>
        <span
          title={
            nextMilestone
              ? `${entry.kills.toLocaleString()} / ${nextMilestone.kills.toLocaleString()}`
              : entry.kills.toLocaleString()
          }
          className="mt-2 block h-1 overflow-hidden rounded-full bg-black/55"
        >
          <span
            className="block h-full bg-linear-to-r from-ui-accent to-ui-gold"
            style={{ width: `${progress}%` }}
          />
        </span>
        <span
          aria-label={t("bosstiary.milestones")}
          className="mt-2 flex justify-around"
        >
          {milestones.map((milestone, index) => (
            <BosstiaryMilestoneIcon
              key={milestone.kills}
              active={entry.kills >= milestone.kills}
              metal={MILESTONE_METALS[index]}
            />
          ))}
        </span>
      </div>
    </button>
  );
}
