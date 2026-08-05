"use client";

import type { OwnCharacterState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { experienceProgress } from "../../lib/inventory/experienceProgress";
import { formatSignedValue } from "../../lib/inventory/formatSignedValue";
import { formatSkillBoost } from "../../lib/inventory/formatSkillBoost";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ProgressionBar } from "./ProgressionBar";
import { StatBreakdown } from "./StatBreakdown";
import { StatDetailRow } from "./StatDetailRow";

interface InventoryCharacterStatsProps {
  character: OwnCharacterState;
  capacityUsed: number;
}

export function InventoryCharacterStats({
  character,
  capacityUsed,
}: InventoryCharacterStatsProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const { inLevel: experienceInLevel, forLevel: experienceForLevel } =
    experienceProgress(character);
  const staminaBonusLabel =
    character.staminaBonusPercent === 100
      ? null
      : character.staminaBonusPercent > 100
        ? `+${character.staminaBonusPercent - 100}%`
        : character.staminaBonusPercent === 0
          ? "0%"
          : `−${100 - character.staminaBonusPercent}%`;
  const staminaValue = t("characterStats.staminaValue", {
    hours: Math.floor(character.stamina / 60),
    minutes: String(character.stamina % 60).padStart(2, "0"),
  });
  // Green while the premium XP bonus is active, red once the ≤14h penalty
  // band starts (staminaBonusPercent < 100), natural otherwise.
  const staminaFillClassName =
    character.staminaBonusPercent > 100
      ? "from-ui-success to-ui-success/65"
      : character.staminaBonusPercent < 100
        ? "from-ui-health to-ui-health/65"
        : "from-ui-gold to-ui-gold/65";

  const bonuses = character.equipmentBonuses;
  const rate = character.experienceRate;
  const multiplier = (percent: number) => `×${(percent / 100).toFixed(2)}`;
  /**
   * A stat's hover body: what the character has on its own, what the gear
   * adds, then the effective total. Returns undefined when gear changes
   * nothing, which leaves the row plain and un-hoverable.
   */
  const breakdown = (label: string, total: number, bonus: number) =>
    bonus === 0 ? undefined : (
      <StatBreakdown
        terms={[
          {
            label: t("characterStats.base"),
            value: (total - bonus).toLocaleString(language),
          },
          {
            label: t("characterStats.equipment"),
            value: formatSignedValue(bonus, language),
            signed: true,
          },
        ]}
        totalLabel={label}
        totalValue={total.toLocaleString(language)}
      />
    );
  /**
   * Skills and magic level can also carry wheel/condition boosts, so their
   * hover keeps those as a separate term and the parts always sum to the
   * effective level the combat formulas use.
   */
  const skillBreakdown = (
    label: string,
    base: number,
    boosted: number | undefined,
    equipment: number,
  ) => {
    if (boosted === undefined || boosted === base) return undefined;
    const other = boosted - base - equipment;
    return (
      <StatBreakdown
        terms={[
          {
            label: t("characterStats.base"),
            value: base.toLocaleString(language),
          },
          ...(equipment !== 0
            ? [
                {
                  label: t("characterStats.equipment"),
                  value: formatSignedValue(equipment, language),
                  signed: true,
                },
              ]
            : []),
          ...(other !== 0
            ? [
                {
                  label: t("characterStats.boosts"),
                  value: formatSignedValue(other, language),
                  signed: true,
                },
              ]
            : []),
        ]}
        totalLabel={label}
        totalValue={boosted.toLocaleString(language)}
      />
    );
  };

  return (
    <aside
      id="character-stats-panel"
      aria-label={t("characterStats.label", { name: character.name })}
      className="ui-panel-frame relative isolate flex h-full w-full min-w-0 flex-col overflow-hidden rounded-r-none border-r-0 p-4"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.045] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 -z-10 h-28 bg-radial from-ui-gold/10 to-transparent blur-xl"
      />

      <header className="pr-4">
        <p className="truncate text-xs tracking-[0.2em] text-ui-gold uppercase">
          {character.name}
        </p>
        <h2 className="font-display text-xl tracking-[0.12em] text-ui-text-bright uppercase">
          {t("characterStats.title")}
        </h2>
        <p className="mt-1 text-sm text-ui-muted">
          {t(`vocations.${character.vocation}.name`)} ·{" "}
          {t("characterStats.level", { level: character.level })}
        </p>
      </header>

      <div aria-hidden className="ui-divider my-4" />

      {/* pt-2 leaves room for the first bar's hover tooltip, which the
          scroll container would otherwise clip. */}
      <div className="ui-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto pt-2 pr-2">
        <section className="space-y-3">
          <ProgressionBar
            label={t("characterStats.experience")}
            value={experienceInLevel}
            max={experienceForLevel}
            valueLabel={
              experienceForLevel > 0
                ? `${experienceInLevel.toLocaleString(language)} / ${experienceForLevel.toLocaleString(language)}`
                : t("characterStats.maximum")
            }
          />
          <ProgressionBar
            label={t("skills.magic")}
            boost={formatSkillBoost(
              character.magicLevel,
              character.boostedMagicLevel,
            )}
            boostTooltip={skillBreakdown(
              t("skills.magic"),
              character.magicLevel,
              character.boostedMagicLevel,
              bonuses.magicLevel,
            )}
            value={character.manaSpent}
            max={character.manaSpentForNextMagicLevel}
            valueLabel={(
              character.boostedMagicLevel ?? character.magicLevel
            ).toLocaleString(language)}
            valueBonus={
              (character.boostedMagicLevel ?? character.magicLevel) -
              character.magicLevel
            }
            fillClassName="from-ui-mana-light to-ui-mana"
          />
          <ProgressionBar
            label={t("stats.stamina")}
            value={character.stamina}
            max={character.maxStamina}
            valueLabel={
              staminaBonusLabel
                ? `${staminaValue} (${staminaBonusLabel})`
                : staminaValue
            }
            fillClassName={staminaFillClassName}
          />
          <ProgressionBar
            label={t("stats.soul")}
            value={character.soul}
            max={character.maxSoul}
            valueLabel={`${character.soul.toLocaleString(language)} / ${character.maxSoul.toLocaleString(language)}`}
            fillClassName="from-ui-gold to-ui-gold/65"
          />
        </section>

        <section>
          <h3 className="mb-2 border-b border-ui-gold/15 pb-2 font-display text-sm tracking-[0.16em] text-ui-gold uppercase">
            {t("characterStats.details")}
          </h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
            <StatDetailRow
              label={t("stats.maxHealth")}
              value={character.maxHealth.toLocaleString(language)}
              bonus={bonuses.maxHealth}
              tooltip={breakdown(
                t("stats.maxHealth"),
                character.maxHealth,
                bonuses.maxHealth,
              )}
            />
            <StatDetailRow
              label={t("stats.healthRegeneration")}
              value={t("characterStats.regeneration", {
                amount: character.healthRegeneration.amount,
                seconds: character.healthRegeneration.intervalMs / 1_000,
              })}
            />
            <StatDetailRow
              label={t("stats.maxMana")}
              value={character.maxMana.toLocaleString(language)}
              bonus={bonuses.maxMana}
              tooltip={breakdown(
                t("stats.maxMana"),
                character.maxMana,
                bonuses.maxMana,
              )}
            />
            <StatDetailRow
              label={t("stats.manaRegeneration")}
              value={t("characterStats.regeneration", {
                amount: character.manaRegeneration.amount,
                seconds: character.manaRegeneration.intervalMs / 1_000,
              })}
            />
            <StatDetailRow
              label={t("inventory.capacity")}
              value={`${capacityUsed.toLocaleString(language)} / ${character.capacity.toLocaleString(language)}`}
              bonus={bonuses.capacity}
              tooltip={breakdown(
                t("inventory.capacity"),
                character.capacity,
                bonuses.capacity,
              )}
            />
            <StatDetailRow
              label={t("stats.soulRegeneration")}
              value={t("characterStats.regeneration", {
                amount: character.soulRegeneration.amount,
                seconds: character.soulRegeneration.intervalMs / 1_000,
              })}
            />
            <StatDetailRow
              label={t("stats.speed")}
              value={character.speed.toLocaleString(language)}
              bonus={bonuses.speed}
              tooltip={breakdown(
                t("stats.speed"),
                character.speed,
                bonuses.speed,
              )}
            />
            <StatDetailRow
              label={t("stats.attackSpeed")}
              value={t("characterStats.seconds", {
                seconds: character.attackSpeedMs / 1_000,
              })}
              // A negative ms delta is a faster swing, so the tint flips sign.
              bonus={-bonuses.attackSpeedMs}
              tooltip={
                bonuses.attackSpeedMs === 0 ? undefined : (
                  <StatBreakdown
                    terms={[
                      {
                        label: t("characterStats.base"),
                        value: t("characterStats.seconds", {
                          seconds:
                            (character.attackSpeedMs -
                              bonuses.attackSpeedMs) /
                            1_000,
                        }),
                      },
                      {
                        label: t("characterStats.equipment"),
                        value: t("characterStats.seconds", {
                          seconds: bonuses.attackSpeedMs / 1_000,
                        }),
                      },
                    ]}
                    totalLabel={t("stats.attackSpeed")}
                    totalValue={t("characterStats.seconds", {
                      seconds: character.attackSpeedMs / 1_000,
                    })}
                  />
                )
              }
            />
            <StatDetailRow
              label={t("stats.experienceRate")}
              value={multiplier(rate.totalPercent)}
              bonus={rate.totalPercent - rate.basePercent}
              tooltip={
                <StatBreakdown
                  terms={[
                    {
                      label: t("characterStats.serverRate"),
                      value: multiplier(rate.basePercent),
                    },
                    ...(rate.xpBoostPercent > 0
                      ? [
                          {
                            label: t("characterStats.xpBoost"),
                            value: `+${rate.xpBoostPercent}%`,
                            signed: true,
                          },
                        ]
                      : []),
                    {
                      label: t("stats.stamina"),
                      value: multiplier(rate.staminaPercent),
                      signed: rate.staminaPercent !== 100,
                    },
                  ]}
                  totalLabel={t("characterStats.total")}
                  totalValue={multiplier(rate.totalPercent)}
                />
              }
            />
          </dl>
        </section>

        {character.combat && (
          <section>
            <h3 className="mb-2 border-b border-ui-gold/15 pb-2 font-display text-sm tracking-[0.16em] text-ui-gold uppercase">
              {t("characterStats.combat")}
            </h3>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              <StatDetailRow
                label={t("stats.criticalChance")}
                value={`${character.combat.criticalChancePercent.toLocaleString(language)}%`}
              />
              <StatDetailRow
                label={t("stats.criticalDamage")}
                value={`${character.combat.criticalDamagePercent.toLocaleString(language)}%`}
              />
              <StatDetailRow
                label={t("stats.lifeLeech")}
                value={`${character.combat.lifeLeechPercent.toLocaleString(language)}%`}
              />
              <StatDetailRow
                label={t("stats.manaLeech")}
                value={`${character.combat.manaLeechPercent.toLocaleString(language)}%`}
              />
              {character.combat.resistances.map((resistance) => (
                <StatDetailRow
                  key={resistance.element}
                  label={t("characterStats.resistance", {
                    element: t(`bestiary.element.${resistance.element}`, {
                      defaultValue: resistance.element,
                    }),
                  })}
                  value={`${formatSignedValue(resistance.percent, language)}%`}
                  bonus={resistance.percent}
                />
              ))}
            </dl>
          </section>
        )}

        <section>
          <h3 className="mb-3 border-b border-ui-gold/15 pb-2 font-display text-sm tracking-[0.16em] text-ui-gold uppercase">
            {t("characterStats.skills")}
          </h3>
          <div className="space-y-3">
            {character.skills.map((skill) => (
              <ProgressionBar
                key={skill.skill}
                label={t(`skills.${skill.skill}`)}
                boost={formatSkillBoost(skill.level, skill.boostedLevel)}
                boostTooltip={skillBreakdown(
                  t(`skills.${skill.skill}`),
                  skill.level,
                  skill.boostedLevel,
                  skill.equipmentBonus ?? 0,
                )}
                value={skill.tries}
                max={skill.triesForNextLevel}
                valueLabel={(skill.boostedLevel ?? skill.level).toLocaleString(
                  language,
                )}
                valueBonus={(skill.boostedLevel ?? skill.level) - skill.level}
                fillClassName="from-ui-accent-light to-ui-accent"
              />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
