import type { CombatConditionState, ConditionType } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

const GLYPHS: Record<ConditionType, string> = {
  haste: "»",
  paralyze: "⌁",
  poison: "☠",
  fire: "♨",
  energy: "ϟ",
  bleeding: "♢",
  curse: "◆",
  dazzled: "✧",
  regeneration: "✚",
  invisible: "◌",
  light: "☀",
  outfit: "♙",
  drunk: "≈",
  mute: "×",
  "magic-shield": "◇",
  "combat-lock": "⚔",
  "pz-lock": "⛨",
};

interface ConditionBarProps {
  conditions: ReadonlyArray<CombatConditionState>;
}

export function ConditionBar({ conditions }: ConditionBarProps) {
  const { t } = useAppTranslation();

  if (conditions.length === 0) return null;

  return (
    <div
      aria-label={t("combat.conditions")}
      className="ui-panel-frame pointer-events-auto flex max-w-80 flex-wrap gap-1 p-1.5"
    >
      {conditions.map((condition) => (
        <span
          key={condition.type}
          title={t("combat.conditionTitle", {
            condition: t(`combat.condition.${condition.type}`),
            seconds: Math.ceil(condition.remainingMs / 1_000),
          })}
          className="relative flex size-8 items-center justify-center rounded border border-ui-gold/20 bg-black/35 font-display text-base text-ui-text-bright"
        >
          {GLYPHS[condition.type]}
          {condition.stacks > 1 && (
            <span className="absolute right-0.5 bottom-0 text-[9px] font-bold">
              {condition.stacks}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
