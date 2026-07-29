import type { CombatConditionState, ConditionType } from "@tibia/protocol";
import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";

const ICON_SOURCES: Record<ConditionType, string> = {
  haste: "/images/game/states/haste.png",
  paralyze: "/images/game/states/slowed.png",
  poison: "/images/game/states/poisoned.png",
  fire: "/images/game/states/burning.png",
  energy: "/images/game/states/electrified.png",
  freeze: "/images/game/states/freezing.png",
  bleeding: "/images/game/states/bleeding.png",
  curse: "/images/game/states/cursed.png",
  dazzled: "/images/game/states/dazzled.png",
  drown: "/images/game/states/drowning.png",
  fear: "/images/game/states/drunk.png",
  root: "/images/game/states/slowed.png",
  attributes: "/images/game/states/cursed.png",
  regeneration: "/images/game/states/strengthened.png",
  invisible: "/images/game/states/invisible.png",
  light: "/images/game/states/light.png",
  outfit: "/images/game/states/outfit.png",
  drunk: "/images/game/states/drunk.png",
  mute: "/images/game/states/mute.png",
  "magic-shield": "/images/game/states/magic_shield.png",
  "combat-lock": "/images/game/states/logout_block.png",
  "pz-lock": "/images/game/states/protection_zone_block.png",
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
      {conditions.map((condition) => {
        const name = t(`combat.condition.${condition.type}`);
        const title = t("combat.conditionTitle", {
          condition: name,
          seconds: Math.ceil(condition.remainingMs / 1_000),
        });

        return (
          <span
            key={condition.type}
            aria-label={title}
            title={title}
            className="flex h-8 items-center gap-1.5 rounded border border-ui-gold/20 bg-black/35 pr-2 pl-1 text-xs font-medium text-ui-text-bright"
          >
            <Image
              src={ICON_SOURCES[condition.type]}
              alt=""
              width={18}
              height={18}
              unoptimized
            />
            <span className="whitespace-nowrap">{name}</span>
            {condition.stacks > 1 && (
              <span aria-hidden="true" className="text-ui-gold">
                ×{condition.stacks}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
