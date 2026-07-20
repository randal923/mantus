"use client";

import type { BestiaryMonsterStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { BestiaryKillProgressBar } from "./BestiaryKillProgressBar";
import { BestiaryLootList } from "./BestiaryLootList";
import { BestiaryResistanceIcon } from "./BestiaryResistanceIcon";
import {
  BestiaryStatIcon,
  type BestiaryStatIconName,
} from "./BestiaryStatIcon";

interface BestiaryMonsterSheetProps {
  monster: BestiaryMonsterStateMessage;
}

/** Public creature catalog detail; kills only drive charm completion. */
export function BestiaryMonsterSheet({ monster }: BestiaryMonsterSheetProps) {
  const { t } = useAppTranslation();
  const stats: ReadonlyArray<{
    key: string;
    icon: BestiaryStatIconName;
    value: string;
  }> = [
    {
      key: "hitpoints",
      icon: "hitpoints",
      value: monster.stats.maxHealth.toLocaleString(),
    },
    {
      key: "experience",
      icon: "experience",
      value: monster.stats.experience.toLocaleString(),
    },
    {
      key: "speed",
      icon: "speed",
      value: monster.stats.speed.toLocaleString(),
    },
    {
      key: "armor",
      icon: "armor",
      value: monster.stats.armor.toLocaleString(),
    },
    {
      key: "mitigation",
      icon: "mitigation",
      value: `${monster.stats.mitigation.toFixed(2)}%`,
    },
    {
      key: "charmPoints",
      icon: "bonus-points",
      value: monster.charmPoints.toLocaleString(),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="ui-panel-inset grid overflow-hidden rounded-sm border border-ui-stone-light/15 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="flex min-h-52 items-center justify-center border-b border-ui-stone-light/10 bg-black/20 p-5 md:border-r md:border-b-0">
          <AnimatedOutfit outfit={monster.outfit} fit={168} />
        </div>
        <div className="flex min-w-0 flex-col justify-center p-5">
          <span className="text-[10px] tracking-[0.2em] text-ui-gold uppercase">
            {monster.className}
          </span>
          <h3 className="mt-1 font-display text-2xl font-bold tracking-wide text-ui-text-bright capitalize">
            {monster.name}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span
            title={t("bestiary.difficulty")}
            aria-label={t("bestiary.difficulty")}
            className="tracking-widest text-yellow-400"
          >
            {"★".repeat(monster.stars) || "–"}
            <span className="text-ui-stone-light/40">
              {"★".repeat(Math.max(0, 5 - monster.stars))}
            </span>
          </span>
          <span
            title={t("bestiary.occurrence")}
            aria-label={t("bestiary.occurrence")}
            className="tracking-widest text-sky-300"
          >
            {"◆".repeat(monster.occurrence + 1)}
            <span className="text-ui-stone-light/40">
              {"◆".repeat(Math.max(0, 4 - monster.occurrence - 1))}
            </span>
          </span>
            <span className="text-xs text-ui-muted">
              {t("bestiary.stat.charmPoints")}: {monster.charmPoints.toLocaleString()}
            </span>
          </div>
          <div className="mt-5 max-w-xl">
            <BestiaryKillProgressBar
              kills={monster.kills}
              firstUnlock={monster.firstUnlock}
              secondUnlock={monster.secondUnlock}
              toKill={monster.toKill}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
          <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("bestiary.stats")}
          </h4>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.key}
                className="flex items-center gap-2 rounded-sm border border-ui-stone-light/10 bg-black/20 px-3 py-2"
              >
                <BestiaryStatIcon name={stat.icon} />
                <span className="min-w-0">
                  <span className="block truncate text-[9px] tracking-widest text-ui-muted uppercase">
                    {t(`bestiary.stat.${stat.key}`)}
                  </span>
                  <span className="mt-0.5 block text-sm text-ui-text-bright">
                    {stat.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
          <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("bestiary.resistances")}
          </h4>
          <ul className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
              {monster.resistances.map((resistance) => (
                <li
                  key={resistance.element}
                  title={`${resistance.percent}%`}
                  className="flex items-center gap-2 text-xs"
                >
                  <BestiaryResistanceIcon element={resistance.element} />
                  <span className="w-14 shrink-0 truncate text-ui-muted">
                    {t(`bestiary.element.${resistance.element}`)}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-xs bg-black/40">
                    <span
                      className={`block h-full ${
                        resistance.percent === 0
                          ? "bg-red-500"
                          : resistance.percent < 100
                            ? "bg-yellow-500"
                            : resistance.percent === 100
                              ? "bg-ui-stone-light/60"
                              : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(200, resistance.percent) / 2}%`,
                      }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-ui-text-bright">
                    {resistance.percent}%
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
          <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("bestiary.loot")}
          </h4>
          <div className="mt-3">
            <BestiaryLootList loot={monster.loot} />
          </div>
        </section>
        <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
          <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("bestiary.locations")}
          </h4>
          <p className="mt-3 text-xs leading-relaxed text-ui-muted">
            {monster.locations || t("bestiary.noLocations")}
          </p>
        </section>
      </div>
    </div>
  );
}
