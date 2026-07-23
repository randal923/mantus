"use client";

import {
  GEM_DESTROY_YIELDS,
  GEM_DOMAIN_ROTATION,
  GEM_SWITCH_DOMAIN_COSTS,
  GEM_VOCATION_NAMES,
  type GemAction,
  type GemStateMessage,
  type RevealedGem,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemModLines } from "../../lib/wheel/gemModLines";
import {
  basicModIconStyle,
  domainIconStyle,
  gemIconStyle,
  supremeModIconStyle,
} from "../../lib/wheel/gemSheets";
import { Button } from "../ui/Button";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemDetailsProps {
  gem: RevealedGem;
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  pending: boolean;
  onAction: (action: GemAction) => void;
}

const gradeOf = (
  entries: ReadonlyArray<{ modId: number; grade: number }>,
  modId: number,
): number => entries.find((entry) => entry.modId === modId)?.grade ?? 0;

const GRADE_NUMERALS = ["I", "II", "III", "IV"] as const;

/** Selected gem: its mods at current grades, and the atelier actions. */
export function GemDetails({
  gem,
  gems,
  vocation,
  pending,
  onAction,
}: GemDetailsProps) {
  const { t } = useAppTranslation();
  const equipped = Object.values(gems.equipped).includes(gem.id);
  const switchCost = GEM_SWITCH_DOMAIN_COSTS[gem.quality];
  const destroyYield = GEM_DESTROY_YIELDS[gem.quality];
  const mutable = !gem.locked && !equipped;

  return (
    <section className="flex flex-col gap-3 rounded border border-ui-gold/15 bg-black/25 p-3">
      <header className="flex items-center gap-2">
        <GemSheetIcon
          style={gemIconStyle(vocation, gem.domain, gem.quality)}
          label={t(`wheel.gems.quality.${gem.quality}`)}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm text-ui-text-bright">
            {t(`wheel.gems.gemName.${gem.quality}`, {
              name: GEM_VOCATION_NAMES[vocation],
            })}
          </h3>
          <p className="flex items-center gap-1 text-xs text-ui-muted">
            <GemSheetIcon style={domainIconStyle(gem.domain)} />
            {t(`wheel.domain.${gem.domain}`)}
            {equipped && (
              <span className="text-ui-accent-light">
                {t("wheel.gems.equipped")}
              </span>
            )}
            {gem.locked && (
              <span className="text-ui-gold">{t("wheel.gems.locked")}</span>
            )}
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-2 text-sm">
        {gem.basicModIds.map((modId, index) => (
          <li key={`basic-${modId}`} className="flex items-start gap-2">
            <GemSheetIcon style={basicModIconStyle(modId)} />
            <span className="whitespace-pre-line">
              {gemModLines(
                "basic",
                modId,
                gradeOf(gems.grades.basic, modId),
                vocation,
              ).join("\n")}
              <span className="block text-xs text-ui-muted">
                {t("wheel.gems.modSlot", { slot: index + 1 })}{" "}
                {t("wheel.gems.grade", {
                  grade: GRADE_NUMERALS[gradeOf(gems.grades.basic, modId)],
                })}
              </span>
            </span>
          </li>
        ))}
        {gem.supremeModId !== undefined && (
          <li className="flex items-start gap-2">
            <GemSheetIcon style={supremeModIconStyle(gem.supremeModId)} />
            <span className="whitespace-pre-line">
              {gemModLines(
                "supreme",
                gem.supremeModId,
                gradeOf(gems.grades.supreme, gem.supremeModId),
                vocation,
              ).join("\n")}
              <span className="block text-xs text-ui-muted">
                {t("wheel.gems.supremeMod")}{" "}
                {t("wheel.gems.grade", {
                  grade:
                    GRADE_NUMERALS[
                      gradeOf(gems.grades.supreme, gem.supremeModId)
                    ],
                })}
              </span>
            </span>
          </li>
        )}
      </ul>

      <div className="flex flex-wrap gap-2">
        {equipped ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onAction({ kind: "unequip", domain: gem.domain })}
          >
            {t("wheel.gems.actions.unequip")}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => onAction({ kind: "equip", gemId: gem.id })}
          >
            {t("wheel.gems.actions.equip")}
          </Button>
        )}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => onAction({ kind: "toggle-lock", gemId: gem.id })}
        >
          {gem.locked
            ? t("wheel.gems.actions.unlock")
            : t("wheel.gems.actions.lock")}
        </Button>
        <Button
          size="sm"
          disabled={pending || !mutable || gems.resources.gold < switchCost}
          title={t("wheel.gems.actions.switchTitle", {
            domain: t(`wheel.domain.${GEM_DOMAIN_ROTATION[gem.domain]}`),
            cost: switchCost.toLocaleString(),
          })}
          onClick={() => onAction({ kind: "switch-domain", gemId: gem.id })}
        >
          {t("wheel.gems.actions.switch")}
        </Button>
        <Button
          size="sm"
          disabled={pending || !mutable}
          title={t("wheel.gems.actions.destroyTitle", {
            min: destroyYield.min,
            max: destroyYield.max,
            fragment: t(`wheel.gems.${destroyYield.fragment}FragmentsShort`),
          })}
          onClick={() => onAction({ kind: "destroy", gemId: gem.id })}
        >
          {t("wheel.gems.actions.destroy")}
        </Button>
      </div>
    </section>
  );
}
