"use client";

import type { OwnCharacterState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatSkillBoost } from "../../lib/inventory/formatSkillBoost";
import { getProgressPercent } from "../../lib/inventory/getProgressPercent";
import { useLanguageStore } from "../../stores/useLanguageStore";
import {
  BestiaryStatIcon,
  type BestiaryStatIconName,
} from "../bestiary/BestiaryStatIcon";
import { ProgressionBar } from "../inventory/ProgressionBar";

interface WikiCharacterGeneralProps {
  character: OwnCharacterState;
  /** Carried weight from the inventory projection, when loaded. */
  capacityUsed: number | null;
}

/** Own general stats straight from the game-window projection; no fetch. */
export function WikiCharacterGeneral({
  character,
  capacityUsed,
}: WikiCharacterGeneralProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const experienceInLevel =
    character.experience - character.experienceForCurrentLevel;
  const experienceForLevel =
    character.experienceForNextLevel - character.experienceForCurrentLevel;
  const staminaValue = t("characterStats.staminaValue", {
    hours: Math.floor(character.stamina / 60),
    minutes: String(character.stamina % 60).padStart(2, "0"),
  });
  const tiles: ReadonlyArray<{
    key: string;
    icon: BestiaryStatIconName | null;
    value: string;
  }> = [
    {
      key: "level",
      icon: "experience",
      value: character.level.toLocaleString(language),
    },
    {
      key: "hitpoints",
      icon: "hitpoints",
      value: `${character.health.toLocaleString(language)} / ${character.maxHealth.toLocaleString(language)}`,
    },
    {
      key: "mana",
      icon: null,
      value: `${character.mana.toLocaleString(language)} / ${character.maxMana.toLocaleString(language)}`,
    },
    {
      key: "capacity",
      icon: "bonus-points",
      value:
        capacityUsed === null
          ? character.capacity.toLocaleString(language)
          : `${capacityUsed.toLocaleString(language)} / ${character.capacity.toLocaleString(language)}`,
    },
    {
      key: "speed",
      icon: "speed",
      value: character.speed.toLocaleString(language),
    },
    {
      key: "experience",
      icon: "experience",
      value: character.experience.toLocaleString(language),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
        <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {t("wiki.character.general.progress")}
        </h4>
        <div className="mt-3 space-y-3">
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
            boost={formatSkillBoost(
              character.magicLevel,
              character.boostedMagicLevel,
            )}
            value={character.manaSpent}
            max={character.manaSpentForNextMagicLevel}
            valueLabel={
              character.manaSpentForNextMagicLevel > 0
                ? `${getProgressPercent(character.manaSpent, character.manaSpentForNextMagicLevel)}/100`
                : t("characterStats.maximum")
            }
            fillClassName="from-ui-mana-light to-ui-mana"
          />
          <ProgressionBar
            label={t("stats.stamina")}
            value={character.stamina}
            max={character.maxStamina}
            valueLabel={staminaValue}
          />
          <ProgressionBar
            label={t("stats.soul")}
            value={character.soul}
            max={character.maxSoul}
            valueLabel={`${character.soul.toLocaleString(language)} / ${character.maxSoul.toLocaleString(language)}`}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="flex items-center gap-2 rounded-sm border border-ui-stone-light/10 bg-black/20 px-3 py-2"
            >
              {tile.icon && <BestiaryStatIcon name={tile.icon} />}
              <span className="min-w-0">
                <span className="block truncate text-xs tracking-widest text-ui-muted uppercase">
                  {t(`wiki.character.general.${tile.key}`)}
                </span>
                <span className="mt-0.5 block text-sm text-ui-text-bright">
                  {tile.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
        <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
          {t("characterStats.skills")}
        </h4>
        <div className="mt-3 space-y-3">
          {character.skills.map((skill) => (
            <ProgressionBar
              key={skill.skill}
              label={`${t(`skills.${skill.skill}`)} · ${skill.level}`}
              boost={formatSkillBoost(skill.level, skill.boostedLevel)}
              value={skill.tries}
              max={skill.triesForNextLevel}
              valueLabel={
                skill.triesForNextLevel > 0
                  ? `${getProgressPercent(skill.tries, skill.triesForNextLevel)}/100`
                  : t("characterStats.maximum")
              }
              fillClassName="from-ui-accent-light to-ui-accent"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
