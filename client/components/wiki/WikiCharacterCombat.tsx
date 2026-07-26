"use client";

import type { CyclopediaCombatStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { BestiaryResistanceIcon } from "../bestiary/BestiaryResistanceIcon";
import {
  BestiaryStatIcon,
  type BestiaryStatIconName,
} from "../bestiary/BestiaryStatIcon";

interface WikiCharacterCombatProps {
  combat: CyclopediaCombatStateMessage | null;
  pending: boolean;
}

/** Server-computed offence/defence snapshot; nothing is derived locally. */
export function WikiCharacterCombat({
  combat,
  pending,
}: WikiCharacterCombatProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  if (!combat) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {pending
          ? t("wiki.character.loading")
          : t("wiki.character.combat.unavailable")}
      </p>
    );
  }

  const percent = (value: number) =>
    `${value.toLocaleString(language, { maximumFractionDigits: 2 })}%`;
  const flat = (value: number) => value.toLocaleString(language);
  const stats: ReadonlyArray<{
    key: string;
    icon: BestiaryStatIconName | null;
    value: string;
  }> = [
    { key: "criticalChance", icon: null, value: percent(combat.criticalChancePercent) },
    { key: "criticalDamage", icon: null, value: percent(combat.criticalDamagePercent) },
    { key: "lifeLeech", icon: "hitpoints", value: percent(combat.lifeLeechPercent) },
    { key: "manaLeech", icon: null, value: percent(combat.manaLeechPercent) },
    { key: "attackSkill", icon: null, value: flat(combat.attackSkill) },
    { key: "attackValue", icon: null, value: flat(combat.attackValue) },
    { key: "defenseValue", icon: null, value: flat(combat.defenseValue) },
    { key: "armorValue", icon: "armor", value: flat(combat.armorValue) },
    { key: "mitigation", icon: "mitigation", value: percent(combat.mitigationPercent) },
    { key: "onslaught", icon: null, value: percent(combat.onslaughtPercent) },
    { key: "ruse", icon: null, value: percent(combat.rusePercent) },
    { key: "momentum", icon: null, value: percent(combat.momentumPercent) },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
      <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
        <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {t("wiki.character.combat.stats")}
        </h4>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className="flex items-center gap-2 rounded-sm border border-ui-stone-light/10 bg-black/20 px-3 py-2"
            >
              {stat.icon && <BestiaryStatIcon name={stat.icon} />}
              <span className="min-w-0">
                <span className="block truncate text-xs tracking-widest text-ui-muted uppercase">
                  {t(`wiki.character.combat.${stat.key}`)}
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
          {t("wiki.character.combat.absorbs")}
        </h4>
        {combat.absorbs.length === 0 ? (
          <p className="mt-3 text-sm text-ui-muted">
            {t("wiki.character.combat.noAbsorbs")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {combat.absorbs.map((absorb) => (
              <li
                key={absorb.element}
                className="flex items-center gap-2 text-sm"
              >
                <BestiaryResistanceIcon element={absorb.element} />
                <span className="min-w-0 flex-1 truncate text-ui-muted">
                  {t(`bestiary.element.${absorb.element}`, {
                    defaultValue: absorb.element,
                  })}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    absorb.percent < 0
                      ? "text-red-300"
                      : "text-ui-text-bright"
                  }`}
                >
                  {absorb.percent}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
