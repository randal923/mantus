"use client";

import type { OwnCharacterState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ProgressionBar } from "./ProgressionBar";

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
  const experienceInLevel =
    character.experience - character.experienceForCurrentLevel;
  const experienceForLevel =
    character.experienceForNextLevel - character.experienceForCurrentLevel;

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
        <p className="truncate text-[10px] tracking-[0.2em] text-ui-gold uppercase">
          {character.name}
        </p>
        <h2 className="font-display text-xl tracking-[0.12em] text-ui-text-bright uppercase">
          {t("characterStats.title")}
        </h2>
        <p className="mt-1 text-xs text-ui-muted">
          {t(`vocations.${character.vocation}.name`)} ·{" "}
          {t("characterStats.level", { level: character.level })}
        </p>
      </header>

      <div aria-hidden className="ui-divider my-4" />

      <div className="ui-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto pr-2">
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
            label={t("characterStats.magicLevel", {
              level: character.magicLevel,
            })}
            value={character.manaSpent}
            max={character.manaSpentForNextMagicLevel}
            valueLabel={
              character.manaSpentForNextMagicLevel > 0
                ? `${character.manaSpent.toLocaleString(language)} / ${character.manaSpentForNextMagicLevel.toLocaleString(language)}`
                : t("characterStats.maximum")
            }
            fillClassName="from-ui-mana-light to-ui-mana"
          />
        </section>

        <section>
          <h3 className="mb-2 border-b border-ui-gold/15 pb-2 font-display text-xs tracking-[0.16em] text-ui-gold uppercase">
            {t("characterStats.details")}
          </h3>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-xs">
            <dt className="text-ui-muted">{t("stats.maxHealth")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {character.maxHealth.toLocaleString(language)}
            </dd>
            <dt className="text-ui-muted">{t("stats.healthRegeneration")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {t("characterStats.regeneration", {
                amount: character.healthRegeneration.amount,
                seconds: character.healthRegeneration.intervalMs / 1_000,
              })}
            </dd>
            <dt className="text-ui-muted">{t("stats.maxMana")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {character.maxMana.toLocaleString(language)}
            </dd>
            <dt className="text-ui-muted">{t("stats.manaRegeneration")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {t("characterStats.regeneration", {
                amount: character.manaRegeneration.amount,
                seconds: character.manaRegeneration.intervalMs / 1_000,
              })}
            </dd>
            <dt className="text-ui-muted">{t("inventory.capacity")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {capacityUsed.toLocaleString(language)} /{" "}
              {character.capacity.toLocaleString(language)}
            </dd>
            <dt className="text-ui-muted">{t("stats.soul")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {character.soul.toLocaleString(language)} /{" "}
              {character.maxSoul.toLocaleString(language)}
            </dd>
            <dt className="text-ui-muted">{t("stats.soulRegeneration")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {t("characterStats.regeneration", {
                amount: character.soulRegeneration.amount,
                seconds: character.soulRegeneration.intervalMs / 1_000,
              })}
            </dd>
            <dt className="text-ui-muted">{t("stats.speed")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {character.speed.toLocaleString(language)}
            </dd>
            <dt className="text-ui-muted">{t("stats.attackSpeed")}</dt>
            <dd className="text-right font-semibold tabular-nums text-ui-text">
              {t("characterStats.seconds", {
                seconds: character.attackSpeedMs / 1_000,
              })}
            </dd>
          </dl>
        </section>

        <section>
          <h3 className="mb-3 border-b border-ui-gold/15 pb-2 font-display text-xs tracking-[0.16em] text-ui-gold uppercase">
            {t("characterStats.skills")}
          </h3>
          <div className="space-y-3">
            {character.skills.map((skill) => (
              <ProgressionBar
                key={skill.skill}
                label={`${t(`skills.${skill.skill}`)} · ${skill.level}`}
                value={skill.tries}
                max={skill.triesForNextLevel}
                valueLabel={
                  skill.triesForNextLevel > 0
                    ? `${skill.tries.toLocaleString(language)} / ${skill.triesForNextLevel.toLocaleString(language)}`
                    : t("characterStats.maximum")
                }
                fillClassName="from-ui-accent-light to-ui-accent"
              />
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
