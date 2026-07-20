"use client";

import type { BestiaryMonsterStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { BestiaryKillProgressBar } from "./BestiaryKillProgressBar";
import { BestiaryLootList } from "./BestiaryLootList";

interface BestiaryMonsterSheetProps {
  monster: BestiaryMonsterStateMessage;
}

/** Creature detail sheet; fields beyond the unlock stage arrive absent. */
export function BestiaryMonsterSheet({ monster }: BestiaryMonsterSheetProps) {
  const { t } = useAppTranslation();
  const stats: ReadonlyArray<{ key: string; value: string | null }> = [
    {
      key: "hitpoints",
      value: monster.stats ? monster.stats.maxHealth.toLocaleString() : null,
    },
    {
      key: "experience",
      value: monster.stats ? monster.stats.experience.toLocaleString() : null,
    },
    {
      key: "speed",
      value: monster.stats ? monster.stats.speed.toLocaleString() : null,
    },
    {
      key: "armor",
      value: monster.stats ? monster.stats.armor.toLocaleString() : null,
    },
    {
      key: "mitigation",
      value: monster.stats ? `${monster.stats.mitigation.toFixed(2)}%` : null,
    },
    { key: "charmPoints", value: monster.charmPoints.toLocaleString() },
  ];

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="ui-panel-inset flex w-full flex-col items-center gap-3 rounded-sm border border-ui-stone-light/20 p-4 md:w-56">
        <span className="flex h-28 items-center justify-center">
          <AnimatedOutfit outfit={monster.outfit} fit={112} />
        </span>
        <span className="text-center text-sm text-ui-text-bright">
          {monster.name}
        </span>
        <span className="text-xs text-ui-muted">{monster.className}</span>
        <div className="flex flex-col items-center gap-1 text-sm">
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
        </div>
        <div className="w-full">
          <BestiaryKillProgressBar
            kills={monster.kills}
            firstUnlock={monster.firstUnlock}
            secondUnlock={monster.secondUnlock}
            toKill={monster.toKill}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section>
          <h3 className="text-[10px] tracking-widest text-ui-gold uppercase">
            {t("bestiary.stats")}
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.key} className="flex justify-between gap-2">
                <dt className="text-ui-muted">{t(`bestiary.stat.${stat.key}`)}</dt>
                <dd className="text-ui-text-bright">{stat.value ?? "?"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="text-[10px] tracking-widest text-ui-gold uppercase">
            {t("bestiary.resistances")}
          </h3>
          {monster.resistances ? (
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {monster.resistances.map((resistance) => (
                <li
                  key={resistance.element}
                  title={`${resistance.percent}%`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-16 shrink-0 text-ui-muted">
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
          ) : (
            <p className="mt-2 text-xs text-ui-muted">
              {t("bestiary.lockedSection")}
            </p>
          )}
        </section>
        <section>
          <h3 className="text-[10px] tracking-widest text-ui-gold uppercase">
            {t("bestiary.loot")}
          </h3>
          <div className="mt-2">
            <BestiaryLootList loot={monster.loot} />
          </div>
        </section>
        <section>
          <h3 className="text-[10px] tracking-widest text-ui-gold uppercase">
            {t("bestiary.locations")}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-ui-muted">
            {monster.locations ?? t("bestiary.lockedSection")}
          </p>
        </section>
      </div>
    </div>
  );
}
