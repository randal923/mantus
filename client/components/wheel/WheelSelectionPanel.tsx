"use client";

import {
  WHEEL_CONVICTION_NAMES,
  WHEEL_CONVICTION_VALUES,
  WHEEL_DEDICATION_RATES,
  WHEEL_MITIGATION_PER_POINT,
  WHEEL_SKILL_BOOST_TARGET,
  type WheelBaseVocation,
  type WheelSliceDefinition,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface WheelSelectionPanelProps {
  slice: WheelSliceDefinition | null;
  points: number;
  baseVocation: WheelBaseVocation;
  editable: boolean;
  canAdd: boolean;
  canRemove: boolean;
  onAddOne: () => void;
  onAddMax: () => void;
  onRemoveOne: () => void;
  onClear: () => void;
}

/**
 * Details for the hovered/selected slice: dedication rate, conviction perk,
 * fill progress, and the point allocation controls.
 */
export function WheelSelectionPanel({
  slice,
  points,
  baseVocation,
  editable,
  canAdd,
  canRemove,
  onAddOne,
  onAddMax,
  onRemoveOne,
  onClear,
}: WheelSelectionPanelProps) {
  const { t } = useAppTranslation();
  if (!slice) {
    return (
      <p className="text-sm text-ui-muted">{t("wheel.selection.empty")}</p>
    );
  }
  const rates = WHEEL_DEDICATION_RATES[baseVocation];
  const dedicationValue = (() => {
    switch (slice.dedication) {
      case "health":
        return t("wheel.dedication.health", { value: rates.health });
      case "mana":
        return t("wheel.dedication.mana", { value: rates.mana });
      case "capacity":
        return t("wheel.dedication.capacity", { value: rates.capacity });
      case "mitigation":
        return t("wheel.dedication.mitigation", {
          value: WHEEL_MITIGATION_PER_POINT,
        });
      case "healthAndMana":
        return t("wheel.dedication.healthAndMana", {
          health: rates.health,
          mana: rates.mana,
        });
    }
  })();
  const convictionLabel = (() => {
    switch (slice.conviction) {
      case "skill":
        return t(
          `wheel.conviction.skill.${WHEEL_SKILL_BOOST_TARGET[baseVocation]}`,
          { value: WHEEL_CONVICTION_VALUES.skillBoost },
        );
      case "lifeLeech":
        return t("wheel.conviction.lifeLeech", {
          value: WHEEL_CONVICTION_VALUES.lifeLeechPercent,
        });
      case "manaLeech":
        return t("wheel.conviction.manaLeech", {
          value: WHEEL_CONVICTION_VALUES.manaLeechPercent,
        });
      case "resonance":
        return t("wheel.conviction.resonance");
      case "spell":
      case "special":
        return (
          WHEEL_CONVICTION_NAMES[slice.id]?.[baseVocation] ??
          t("wheel.conviction.resonance")
        );
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm text-ui-text-bright">
          {t(`wheel.domain.${slice.domain}`)}
        </span>
        <span className="text-sm text-ui-gold">
          {points} / {slice.maxPoints}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-ui-gold/80"
          style={{ width: `${(points / slice.maxPoints) * 100}%` }}
        />
      </div>
      <p className="text-sm leading-6 text-ui-text/85">
        <span className="text-ui-muted">{t("wheel.selection.dedication")}:</span>{" "}
        {dedicationValue}
      </p>
      <p className="text-sm leading-6 text-ui-text/85">
        <span className="text-ui-muted">{t("wheel.selection.conviction")}:</span>{" "}
        {convictionLabel}
        {points === slice.maxPoints && (
          <span className="ml-1 text-ui-success">
            {t("wheel.selection.active")}
          </span>
        )}
      </p>
      {editable && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button size="sm" disabled={!canAdd} onClick={onAddOne}>
            +1
          </Button>
          <Button size="sm" disabled={!canAdd} onClick={onAddMax}>
            {t("wheel.selection.fill")}
          </Button>
          <Button size="sm" disabled={!canRemove} onClick={onRemoveOne}>
            -1
          </Button>
          <Button size="sm" disabled={!canRemove} onClick={onClear}>
            {t("wheel.selection.clear")}
          </Button>
        </div>
      )}
    </div>
  );
}
