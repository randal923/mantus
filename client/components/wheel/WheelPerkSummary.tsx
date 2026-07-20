"use client";

import {
  WHEEL_CONVICTION_NAMES,
  WHEEL_DOMAINS,
  WHEEL_REVELATION_PERKS,
  WHEEL_REVELATION_THRESHOLDS,
  WHEEL_SKILL_BOOST_TARGET,
  WHEEL_SLICES,
  type WheelBaseVocation,
  type WheelBonuses,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface WheelPerkSummaryProps {
  bonuses: WheelBonuses;
  /** Draft allocation, index = slice id - 1, for named conviction perks. */
  slices: ReadonlyArray<number>;
  baseVocation: WheelBaseVocation;
}

/**
 * The three perk lists next to the wheel: dedication totals, active
 * conviction perks, and per-domain revelation perks with their stage.
 */
export function WheelPerkSummary({
  bonuses,
  slices,
  baseVocation,
}: WheelPerkSummaryProps) {
  const { t } = useAppTranslation();
  const skillTarget = WHEEL_SKILL_BOOST_TARGET[baseVocation];
  const skillBoost = bonuses.skillBoosts[skillTarget];
  const namedPerks = WHEEL_SLICES.filter(
    (slice) =>
      (slice.conviction === "spell" || slice.conviction === "special") &&
      (slices[slice.id - 1] ?? 0) === slice.maxPoints,
  ).map((slice) => WHEEL_CONVICTION_NAMES[slice.id]?.[baseVocation]);
  const namedCounts = new Map<string, number>();
  for (const name of namedPerks) {
    if (name) namedCounts.set(name, (namedCounts.get(name) ?? 0) + 1);
  }

  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-2" key={label}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-ui-gold">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 text-xs leading-5">
      <section>
        <h3 className="mb-1 font-display text-sm tracking-wide text-ui-text-bright">
          {t("wheel.summary.dedication")}
        </h3>
        {row(t("wheel.summary.hitPoints"), `+${bonuses.maxHealth}`)}
        {row(t("wheel.summary.mana"), `+${bonuses.maxMana}`)}
        {row(t("wheel.summary.capacity"), `+${bonuses.capacity}`)}
        {row(
          t("wheel.summary.mitigation"),
          `${bonuses.mitigationPercent.toFixed(2)}%`,
        )}
      </section>
      <section>
        <h3 className="mb-1 font-display text-sm tracking-wide text-ui-text-bright">
          {t("wheel.summary.conviction")}
        </h3>
        {skillBoost > 0 &&
          row(t(`wheel.conviction.skill.${skillTarget}`, { value: "" }).trim(), `+${skillBoost}`)}
        {bonuses.lifeLeechPercent > 0 &&
          row(t("wheel.summary.lifeLeech"), `+${bonuses.lifeLeechPercent}%`)}
        {bonuses.manaLeechPercent > 0 &&
          row(t("wheel.summary.manaLeech"), `+${bonuses.manaLeechPercent}%`)}
        {[...namedCounts.entries()].map(([name, count]) =>
          row(name, count > 1 ? "II" : "I"),
        )}
        {skillBoost === 0 &&
          bonuses.lifeLeechPercent === 0 &&
          bonuses.manaLeechPercent === 0 &&
          namedCounts.size === 0 && (
            <p className="text-ui-muted">{t("wheel.summary.none")}</p>
          )}
      </section>
      <section>
        <h3 className="mb-1 font-display text-sm tracking-wide text-ui-text-bright">
          {t("wheel.summary.revelation")}
        </h3>
        {WHEEL_DOMAINS.map((domain) => {
          const stage = bonuses.revelationStages[domain];
          return row(
            WHEEL_REVELATION_PERKS[domain][baseVocation],
            stage > 0
              ? t("wheel.summary.stage", { stage })
              : t("wheel.summary.locked"),
          );
        })}
        {bonuses.damageAndHealing > 0 && (
          <>
            {row(t("wheel.summary.damage"), `+${bonuses.damageAndHealing}`)}
            {row(t("wheel.summary.healing"), `+${bonuses.damageAndHealing}`)}
          </>
        )}
        <p className="mt-1 text-[10px] text-ui-muted">
          {t("wheel.summary.thresholds", {
            thresholds: WHEEL_REVELATION_THRESHOLDS.join(" / "),
          })}
        </p>
      </section>
    </div>
  );
}
