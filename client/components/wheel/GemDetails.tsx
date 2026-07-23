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
  const { t, i18n } = useAppTranslation();
  const equipped = Object.values(gems.equipped).includes(gem.id);
  const switchCost = GEM_SWITCH_DOMAIN_COSTS[gem.quality];
  const destroyYield = GEM_DESTROY_YIELDS[gem.quality];
  const mutable = !gem.locked && !equipped;

  return (
    <section className="ui-panel-inset overflow-hidden rounded-md border border-ui-stone-light/15">
      <header className="border-b border-ui-stone-light/15 bg-white/3 px-4 py-3">
        <p className="font-display text-xs tracking-wider text-ui-gold uppercase">
          {t("wheel.gems.selectedTitle")}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-ui-gold/20 bg-black/30 shadow-inner shadow-black/60">
            <GemSheetIcon
              style={gemIconStyle(vocation, gem.domain, gem.quality)}
              label={t(`wheel.gems.quality.${gem.quality}`)}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base leading-5 text-ui-text-bright">
              {t(`wheel.gems.gemName.${gem.quality}`, {
                name: GEM_VOCATION_NAMES[vocation],
              })}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-ui-muted">
              <GemSheetIcon style={domainIconStyle(gem.domain)} />
              {t(`wheel.domain.${gem.domain}`)}
            </p>
          </div>
        </div>
        {(equipped || gem.locked) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {equipped && (
              <span className="rounded-full border border-ui-accent-light/25 bg-ui-accent/10 px-2 py-0.5 text-xs text-ui-accent-light">
                {t("wheel.gems.equipped")}
              </span>
            )}
            {gem.locked && (
              <span className="rounded-full border border-ui-gold/25 bg-ui-gold/10 px-2 py-0.5 text-xs text-ui-gold">
                {t("wheel.gems.locked")}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="p-3">
        <h4 className="mb-2 font-display text-xs tracking-wider text-ui-muted uppercase">
          {t("wheel.gems.modifiers")}
        </h4>
        <ul className="flex flex-col gap-2 text-sm">
          {gem.basicModIds.map((modId, index) => {
            const grade = gradeOf(gems.grades.basic, modId);
            return (
              <li
                key={`basic-${modId}`}
                className="flex items-start gap-2 rounded-md border border-ui-stone-light/10 bg-black/20 p-2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded border border-ui-gold/10 bg-black/25">
                  <GemSheetIcon style={basicModIconStyle(modId)} />
                </span>
                <span className="min-w-0 whitespace-pre-line text-ui-text-bright">
                  {gemModLines("basic", modId, grade, vocation).join("\n")}
                  <span className="mt-1 block text-xs text-ui-muted">
                    {t("wheel.gems.modSlot", { slot: index + 1 })}{" "}
                    {t("wheel.gems.grade", {
                      grade: GRADE_NUMERALS[grade],
                    })}
                  </span>
                </span>
              </li>
            );
          })}
          {gem.supremeModId !== undefined && (
            <li className="flex items-start gap-2 rounded-md border border-ui-gold/15 bg-ui-gold/5 p-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded border border-ui-gold/15 bg-black/25">
                <GemSheetIcon
                  style={supremeModIconStyle(gem.supremeModId)}
                />
              </span>
              <span className="min-w-0 whitespace-pre-line text-ui-text-bright">
                {gemModLines(
                  "supreme",
                  gem.supremeModId,
                  gradeOf(gems.grades.supreme, gem.supremeModId),
                  vocation,
                ).join("\n")}
                <span className="mt-1 block text-xs text-ui-gold">
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
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-ui-stone-light/15 bg-black/10 p-3">
        {equipped ? (
          <Button
            size="sm"
            className="col-span-2 w-full"
            disabled={pending}
            onClick={() => onAction({ kind: "unequip", domain: gem.domain })}
          >
            {t("wheel.gems.actions.unequip")}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="col-span-2 w-full"
            disabled={pending}
            onClick={() => onAction({ kind: "equip", gemId: gem.id })}
          >
            {t("wheel.gems.actions.equip")}
          </Button>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={pending}
          onClick={() => onAction({ kind: "toggle-lock", gemId: gem.id })}
        >
          {gem.locked
            ? t("wheel.gems.actions.unlock")
            : t("wheel.gems.actions.lock")}
        </Button>
        <Button
          size="sm"
          className="w-full"
          disabled={pending || !mutable || gems.resources.gold < switchCost}
          title={t("wheel.gems.actions.switchTitle", {
            domain: t(`wheel.domain.${GEM_DOMAIN_ROTATION[gem.domain]}`),
            cost: switchCost.toLocaleString(i18n.language),
          })}
          onClick={() => onAction({ kind: "switch-domain", gemId: gem.id })}
        >
          {t("wheel.gems.actions.switch")}
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="col-span-2 w-full"
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
      </footer>
    </section>
  );
}
