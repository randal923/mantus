"use client";

import {
  BOSSTIARY_MILESTONES,
  type BosstiaryBossStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { BestiaryLootList } from "./BestiaryLootList";
import { BestiaryResistanceIcon } from "./BestiaryResistanceIcon";
import { BestiaryStatIcon } from "./BestiaryStatIcon";
import { BosstiaryCategoryIcon } from "./BosstiaryCategoryIcon";
import { BosstiaryMilestoneIcon } from "./BosstiaryMilestoneIcon";

const MILESTONE_METALS = ["bronze", "silver", "gold"] as const;

interface BosstiaryBossSheetProps {
  boss: BosstiaryBossStateMessage;
}

export function BosstiaryBossSheet({ boss }: BosstiaryBossSheetProps) {
  const { t } = useAppTranslation();
  const milestones = BOSSTIARY_MILESTONES[boss.category];
  const finalMilestone = milestones[milestones.length - 1];
  const nextMilestone = milestones.find((milestone) => boss.kills < milestone.kills);
  const points = milestones.reduce(
    (total, milestone) =>
      boss.kills >= milestone.kills ? total + milestone.points : total,
    0,
  );
  const progress = Math.min(100, (boss.kills / finalMilestone.kills) * 100);
  const stats = [
    {
      key: "hitpoints",
      icon: "hitpoints" as const,
      value: boss.stats.maxHealth.toLocaleString(),
    },
    {
      key: "experience",
      icon: "experience" as const,
      value: boss.stats.experience.toLocaleString(),
    },
    {
      key: "speed",
      icon: "speed" as const,
      value: boss.stats.speed.toLocaleString(),
    },
    {
      key: "armor",
      icon: "armor" as const,
      value: boss.stats.armor.toLocaleString(),
    },
    {
      key: "mitigation",
      icon: "mitigation" as const,
      value: `${boss.stats.mitigation.toFixed(2)}%`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="ui-panel-inset overflow-hidden rounded-sm border border-ui-stone-light/15">
        <header className="flex items-center justify-center gap-2 border-b border-ui-stone-light/10 bg-ui-panel-light/35 px-4 py-3">
          <BosstiaryCategoryIcon category={boss.category} size={20} />
          <h3 className="font-display text-lg font-bold tracking-wide text-ui-text-bright capitalize">
            {boss.name}
          </h3>
        </header>
        <div className="grid gap-4 p-4 lg:grid-cols-[18rem_minmax(17rem,0.8fr)_minmax(0,1.4fr)]">
          <div className="flex min-h-52 items-center justify-center rounded-sm border border-ui-stone-light/10 bg-black/20">
            <AnimatedOutfit outfit={boss.outfit} fit={176} />
          </div>

          <div className="flex flex-col justify-center">
            <span className="text-xs tracking-widest text-ui-muted uppercase">
              {t("bestiary.totalKills")}
            </span>
            <span className="mt-1 border-y border-ui-stone-light/15 bg-black/40 py-2 text-center font-display text-xl font-bold text-ui-text-bright">
              {boss.kills.toLocaleString()}
            </span>
            <span className="mt-4 h-2 overflow-hidden rounded-full bg-black/50">
              <span
                className="block h-full bg-linear-to-r from-ui-accent to-ui-gold"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="mt-1 text-right text-xs text-ui-muted">
              {nextMilestone
                ? `${boss.kills.toLocaleString()} / ${nextMilestone.kills.toLocaleString()}`
                : t("wiki.bosstiary.complete")}
            </span>
            <span className="mt-4 flex justify-around">
              {milestones.map((milestone, index) => (
                <span key={milestone.kills} className="flex flex-col items-center gap-1">
                  <BosstiaryMilestoneIcon
                    active={boss.kills >= milestone.kills}
                    metal={MILESTONE_METALS[index]}
                  />
                  <span className="text-xs text-ui-muted">
                    {milestone.kills.toLocaleString()}
                  </span>
                </span>
              ))}
            </span>
            <span className="mt-4 text-center text-sm text-ui-gold">
              {t("bosstiary.bossPoints", { points: points.toLocaleString() })}
            </span>
          </div>

          <div className="grid content-center gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.key}
                  className="flex items-center gap-2 rounded-sm border border-ui-stone-light/10 bg-black/20 px-3 py-2"
                >
                  <BestiaryStatIcon name={stat.icon} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs tracking-widest text-ui-muted uppercase">
                      {t(`bestiary.stat.${stat.key}`)}
                    </span>
                    <span className="block text-sm text-ui-text-bright">
                      {stat.value}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-5 gap-y-2 xl:grid-cols-3">
              {boss.resistances.map((resistance) => (
                <li
                  key={resistance.element}
                  className="flex items-center gap-2 text-sm"
                >
                  <BestiaryResistanceIcon element={resistance.element} />
                  <span className="min-w-16 text-ui-muted">
                    {t(`bestiary.element.${resistance.element}`)}
                  </span>
                  <span className="ml-auto text-ui-text-bright">
                    {resistance.percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
        <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {t("bestiary.loot")}
        </h4>
        <div className="mt-3">
          <BestiaryLootList loot={boss.loot} />
        </div>
      </section>
    </div>
  );
}
