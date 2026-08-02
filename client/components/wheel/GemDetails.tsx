"use client";

import Image from "next/image";
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
import { gemLargeIconStyle } from "../../lib/wheel/gemLargeIconStyle";
import { gemModLines } from "../../lib/wheel/gemModLines";
import { domainIconStyle } from "../../lib/wheel/gemSheets";
import { FragmentWorkshopModArtwork } from "./FragmentWorkshopModArtwork";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemDetailsProps {
  gem: RevealedGem | null;
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  pending: boolean;
  onAction: (action: GemAction) => void;
}

const gradeOf = (
  entries: ReadonlyArray<{ modId: number; grade: number }>,
  modId: number,
): number => entries.find((entry) => entry.modId === modId)?.grade ?? 0;

/** Tibia-style selected-gem summary, modifier row, and mutation controls. */
export function GemDetails({
  gem,
  gems,
  vocation,
  pending,
  onAction,
}: GemDetailsProps) {
  const { t, i18n } = useAppTranslation();

  if (!gem) {
    return (
      <section className="ui-panel-inset overflow-hidden rounded border border-ui-stone-light/20">
        <header className="border-b border-ui-stone-light/15 bg-white/3 px-3 py-1 text-center">
          <h3 className="font-display text-xs tracking-wide text-ui-text-bright">
            {t("wheel.gems.detailsTitle")}
          </h3>
        </header>
        <p className="flex min-h-32 items-center justify-center px-5 text-center text-sm text-ui-muted">
          {t("wheel.gems.selectGem")}
        </p>
      </section>
    );
  }

  const equipped = Object.values(gems.equipped).includes(gem.id);
  const switchCost = GEM_SWITCH_DOMAIN_COSTS[gem.quality];
  const destroyYield = GEM_DESTROY_YIELDS[gem.quality];
  const mutable = !gem.locked && !equipped;
  const modSlots = [
    ...gem.basicModIds.map((modId) => ({
      kind: "basic" as const,
      modId,
      grade: gradeOf(gems.grades.basic, modId),
    })),
    ...(gem.supremeModId === undefined
      ? []
      : [
          {
            kind: "supreme" as const,
            modId: gem.supremeModId,
            grade: gradeOf(gems.grades.supreme, gem.supremeModId),
          },
        ]),
  ];

  return (
    <section className="ui-panel-inset overflow-hidden rounded border border-ui-stone-light/20">
      <header className="border-b border-ui-stone-light/15 bg-white/3 px-3 py-1 text-center">
        <h3 className="font-display text-xs tracking-wide text-ui-text-bright">
          {t("wheel.gems.detailsTitle")}
        </h3>
      </header>
      <div className="grid gap-2 px-3 pt-2 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="grid min-h-24 grid-cols-[minmax(0,1fr)_4rem] items-center gap-2">
          <div className="min-w-0 text-center">
            <p className="font-display text-xs font-semibold leading-4 text-ui-text-bright">
              {t(`wheel.gems.gemName.${gem.quality}`, {
                name: GEM_VOCATION_NAMES[vocation],
              })}
            </p>
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-ui-muted">
              <span>{t("wheel.gems.domainAffinity")}</span>
              <GemSheetIcon
                style={domainIconStyle(gem.domain)}
                label={t(`wheel.domain.${gem.domain}`)}
              />
            </div>
          </div>
          <GemSheetIcon
            style={gemLargeIconStyle(vocation, gem.domain, gem.quality)}
            label={t(`wheel.gems.quality.${gem.quality}`)}
          />
        </div>

        <ul className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modSlots.map((mod) => {
            const lines = gemModLines(
              mod.kind,
              mod.modId,
              mod.grade,
              vocation,
            );
            return (
              <li
                key={`${mod.kind}-${mod.modId}`}
                className="flex min-h-24 flex-col items-center justify-center px-2 text-center"
              >
                <FragmentWorkshopModArtwork
                  kind={mod.kind}
                  modId={mod.modId}
                  grade={mod.grade}
                />
                <span className="mt-1 whitespace-pre-line text-xs font-semibold leading-4 text-ui-text-bright">
                  {lines.join("\n")}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
        <button
          type="button"
          aria-label={
            equipped
              ? t("wheel.gems.actions.unequip")
              : t("wheel.gems.actions.equip")
          }
          disabled={pending}
          onClick={() =>
            equipped
              ? onAction({ kind: "unequip", domain: gem.domain })
              : onAction({ kind: "equip", gemId: gem.id })
          }
          className={`h-5 w-[108px] shrink-0 bg-no-repeat [image-rendering:pixelated] enabled:active:bg-[position:0_-20px] disabled:opacity-45 ${
            equipped
              ? "bg-[url('/assets/wheel/remove-vessel-button.png')]"
              : "bg-[url('/assets/wheel/place-vessel-button.png')]"
          }`}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={t("wheel.gems.actions.switch")}
            title={t("wheel.gems.actions.switchTitle", {
              domain: t(`wheel.domain.${GEM_DOMAIN_ROTATION[gem.domain]}`),
              cost: switchCost.toLocaleString(i18n.language),
            })}
            disabled={
              pending || !mutable || gems.resources.gold < switchCost
            }
            onClick={() =>
              onAction({ kind: "switch-domain", gemId: gem.id })
            }
            className="h-5 w-[86px] shrink-0 bg-[url('/assets/wheel/switch-button.png')] bg-[length:86px_60px] bg-no-repeat [image-rendering:pixelated] enabled:active:bg-[position:0_-20px] disabled:bg-[position:0_-40px]"
          />
          <span className="flex h-5 items-center gap-1 rounded border border-ui-stone-light/20 bg-black/35 px-2 text-[11px] font-semibold tabular-nums text-ui-text">
            {switchCost.toLocaleString(i18n.language)}
            <Image
              src="/assets/cyclopedia/currency/gold.png"
              alt=""
              aria-hidden
              width={12}
              height={12}
              className="[image-rendering:pixelated]"
            />
          </span>
          <button
            type="button"
            aria-label={t("wheel.gems.actions.destroy")}
            title={t("wheel.gems.actions.destroyTitle", {
              min: destroyYield.min,
              max: destroyYield.max,
              fragment: t(
                `wheel.gems.${destroyYield.fragment}FragmentsShort`,
              ),
            })}
            disabled={pending || !mutable}
            onClick={() => onAction({ kind: "destroy", gemId: gem.id })}
            className="h-5 w-[86px] shrink-0 bg-[url('/assets/wheel/destroy-button.png')] bg-[length:86px_60px] bg-no-repeat [image-rendering:pixelated] enabled:active:bg-[position:0_-20px] disabled:bg-[position:0_-40px]"
          />
        </div>
      </footer>
    </section>
  );
}
