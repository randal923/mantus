"use client";

import {
  GEM_ATELIER_LIMITS,
  GEM_GRADE_COSTS,
  type GemResources,
  type WheelBaseVocation,
} from "@tibia/protocol";
import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemModLines } from "../../lib/wheel/gemModLines";
import { fragmentIconStyle } from "../../lib/wheel/gemSheets";
import { FragmentWorkshopModArtwork } from "./FragmentWorkshopModArtwork";
import type { FragmentWorkshopModOption } from "./FragmentWorkshopModOption";
import { GemSheetIcon } from "./GemSheetIcon";

interface FragmentWorkshopGradePanelProps {
  mod: FragmentWorkshopModOption | null;
  vocation: WheelBaseVocation;
  resources: GemResources;
  pending: boolean;
  onImprove: () => void;
}

const GRADES = [3, 2, 1, 0] as const;
const GRADE_NUMERALS = ["I", "II", "III", "IV"] as const;

/** Tibia-style four-stage ladder and upgrade controls for the selected mod. */
export function FragmentWorkshopGradePanel({
  mod,
  vocation,
  resources,
  pending,
  onImprove,
}: FragmentWorkshopGradePanelProps) {
  const { t, i18n } = useAppTranslation();

  if (!mod) {
    return (
      <section className="ui-panel-inset min-h-[32rem] overflow-hidden rounded-md border border-ui-stone-light/20">
        <h3 className="border-b border-ui-stone-light/20 bg-white/3 px-4 py-2 text-center font-display text-sm tracking-wider text-ui-text-bright uppercase">
          {t("wheel.gems.workshop.enhanceModGrade")}
        </h3>
        <p className="flex min-h-96 items-center justify-center px-6 text-center text-sm text-ui-muted">
          {t("wheel.gems.workshop.noMatches")}
        </p>
      </section>
    );
  }

  const cost =
    mod.grade >= GEM_ATELIER_LIMITS.maxGrade
      ? undefined
      : GEM_GRADE_COSTS[mod.kind][mod.grade];
  const fragments =
    mod.kind === "basic"
      ? resources.lesserFragments
      : resources.greaterFragments;
  const fragmentKind = mod.kind === "basic" ? "lesser" : "greater";
  const hasGold = cost ? resources.gold >= cost.gold : true;
  const hasFragments = cost ? fragments >= cost.fragments : true;

  return (
    <section className="ui-panel-inset flex min-h-[32rem] flex-col overflow-hidden rounded-md border border-ui-stone-light/20">
      <h3 className="border-b border-ui-stone-light/20 bg-white/3 px-4 py-2 text-center font-display text-sm tracking-wider text-ui-text-bright uppercase">
        {t("wheel.gems.workshop.enhanceModGrade")}
      </h3>
      <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
        {mod.name && (
          <p className="mb-2 text-center text-sm font-semibold text-ui-text-bright">
            {mod.name}
          </p>
        )}
        <div className="mx-auto w-full max-w-72 flex-1">
          {GRADES.map((grade) => {
            const active = mod.grade >= grade;
            const position =
              grade === 3 ? "top" : grade === 0 ? "bottom" : "mid";
            return (
              <div
                key={grade}
                className={`grid grid-cols-[54px_minmax(0,1fr)] gap-5 ${
                  grade > 0 ? "pb-[54px]" : ""
                }`}
              >
                <span className="relative size-[54px]">
                  <Image
                    src={`/assets/wheel/backdrop_grades_circle_${position}.png`}
                    alt=""
                    aria-hidden
                    width={54}
                    height={54}
                    className={`absolute inset-0 [image-rendering:pixelated] ${
                      active ? "" : "opacity-45 grayscale"
                    }`}
                  />
                  {active && (
                    <Image
                      src={`/assets/wheel/backdrop_grades_circle_${position}_anim.png`}
                      alt=""
                      aria-hidden
                      width={54}
                      height={54}
                      className="absolute inset-0 opacity-75 [image-rendering:pixelated]"
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <FragmentWorkshopModArtwork
                      kind={mod.kind}
                      modId={mod.id}
                      grade={grade}
                      dimmed={!active}
                    />
                  </span>
                  {grade > 0 && (
                    <>
                      <Image
                        src="/assets/wheel/backdrop_grades_line.png"
                        alt=""
                        aria-hidden
                        width={6}
                        height={54}
                        className={`absolute top-[54px] left-6 [image-rendering:pixelated] ${
                          active ? "" : "opacity-45 grayscale"
                        }`}
                      />
                      {active && (
                        <Image
                          src="/assets/wheel/backdrop_grades_line_anim.png"
                          alt=""
                          aria-hidden
                          width={6}
                          height={54}
                          className="absolute top-[54px] left-6 opacity-75 [image-rendering:pixelated]"
                        />
                      )}
                    </>
                  )}
                </span>
                <span
                  className={`flex min-w-0 flex-col justify-center text-center ${
                    active ? "text-ui-text" : "text-ui-muted/55"
                  }`}
                >
                  <span className="font-display text-sm font-semibold">
                    {t("wheel.gems.grade", {
                      grade: GRADE_NUMERALS[grade],
                    })}
                  </span>
                  <span className="mt-0.5 whitespace-pre-line text-xs leading-5">
                    {gemModLines(mod.kind, mod.id, grade, vocation).join("\n")}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        {cost ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ui-stone-light/15 pt-3">
            <button
              type="button"
              disabled={pending || !hasGold || !hasFragments}
              onClick={onImprove}
              aria-label={t("wheel.gems.workshop.improve")}
              className="h-7 w-[90px] shrink-0 bg-[url('/assets/wheel/enhance-button.png')] bg-[length:90px_84px] bg-no-repeat [image-rendering:pixelated] enabled:active:bg-[position:0_-28px] disabled:bg-[position:0_-56px]"
            >
              <span className="sr-only">
                {t("wheel.gems.workshop.improve")}
              </span>
            </button>
            <span
              className={`flex h-7 items-center gap-1.5 rounded border border-ui-stone-light/20 bg-black/30 px-2 text-sm tabular-nums ${
                hasGold ? "text-ui-gold" : "text-ui-accent-light"
              }`}
            >
              {cost.gold.toLocaleString(i18n.language)}
              <Image
                src="/assets/cyclopedia/currency/gold.png"
                alt=""
                aria-hidden
                width={14}
                height={14}
                className="[image-rendering:pixelated]"
              />
            </span>
            <span
              className={`flex h-7 items-center gap-1.5 rounded border border-ui-stone-light/20 bg-black/30 px-2 text-sm tabular-nums ${
                hasFragments ? "text-ui-text" : "text-ui-accent-light"
              }`}
            >
              {cost.fragments.toLocaleString(i18n.language)}
              <span className="flex scale-125 items-center">
                <GemSheetIcon style={fragmentIconStyle(fragmentKind)} />
              </span>
            </span>
          </div>
        ) : (
          <p className="mt-3 border-t border-ui-stone-light/15 pt-3 text-center text-xs text-ui-gold">
            {t("wheel.gems.workshop.maxed")}
          </p>
        )}
      </div>
    </section>
  );
}
