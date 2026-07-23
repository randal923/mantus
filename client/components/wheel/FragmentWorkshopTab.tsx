"use client";

import Image from "next/image";
import { useState } from "react";
import {
  GEM_ATELIER_LIMITS,
  GEM_BASIC_MODS,
  GEM_GRADE_COSTS,
  GEM_SUPREME_MODS,
  type GemAction,
  type GemActionFailedReason,
  type GemStateMessage,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemModLines } from "../../lib/wheel/gemModLines";
import {
  basicModIconStyle,
  fragmentIconStyle,
  supremeModIconStyle,
} from "../../lib/wheel/gemSheets";
import { Button } from "../ui/Button";
import { GemResourceBar } from "./GemResourceBar";
import { GemSheetIcon } from "./GemSheetIcon";

interface FragmentWorkshopTabProps {
  gems: GemStateMessage | null;
  vocation: WheelBaseVocation;
  pending: boolean;
  error: GemActionFailedReason | null;
  onAction: (action: GemAction) => void;
}

const GRADE_NUMERALS = ["I", "II", "III", "IV"] as const;

/** Fragment Workshop: raise mod grades for gold + fragments. */
export function FragmentWorkshopTab({
  gems,
  vocation,
  pending,
  error,
  onAction,
}: FragmentWorkshopTabProps) {
  const { t, i18n } = useAppTranslation();
  const [kind, setKind] = useState<"basic" | "supreme">("basic");

  if (!gems) {
    return (
      <p className="p-6 text-center text-sm text-ui-muted">
        {t("wheel.gems.loading")}
      </p>
    );
  }

  const mods =
    kind === "basic"
      ? GEM_BASIC_MODS.map((mod) => ({ id: mod.id, name: undefined }))
      : GEM_SUPREME_MODS.filter(
          (mod) =>
            mod.vocations === "all" || mod.vocations.includes(vocation),
        ).map((mod) => ({ id: mod.id, name: mod.name }));
  const grades = gems.grades[kind];
  const fragments =
    kind === "basic"
      ? gems.resources.lesserFragments
      : gems.resources.greaterFragments;
  const fragmentKind = kind === "basic" ? "lesser" : "greater";
  const equippedIds = new Set(Object.values(gems.equipped));
  const carriedCount = (modId: number): number =>
    gems.revealed.filter((gem) =>
      kind === "basic"
        ? gem.basicModIds.includes(modId)
        : gem.supremeModId === modId,
    ).length;
  const socketed = (modId: number): boolean =>
    gems.revealed.some(
      (gem) =>
        equippedIds.has(gem.id) &&
        (kind === "basic"
          ? gem.basicModIds.includes(modId)
          : gem.supremeModId === modId),
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GemResourceBar resources={gems.resources} />
        <div
          role="tablist"
          aria-label={t("wheel.gems.workshop.kinds")}
          className="flex gap-1 rounded-md border border-ui-stone-light/15 bg-black/25 p-1"
        >
          {(["basic", "supreme"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              className={`ui-button rounded border px-4 py-2 text-sm ${
                kind === value
                  ? "ui-button-primary border-ui-accent-light/50 text-ui-text-bright"
                  : "border-transparent text-ui-muted hover:border-ui-stone-light/20 hover:text-ui-text-bright"
              }`}
            >
              {t(`wheel.gems.workshop.${value}`)}
            </button>
          ))}
        </div>
        {error && (
          <span className="text-sm text-ui-accent-light">
            {t(`wheel.gems.errors.${error}`)}
          </span>
        )}
      </div>
      <div className="ui-panel-inset ui-scrollbar overflow-x-auto rounded-md border border-ui-stone-light/15">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            {t(`wheel.gems.workshop.${kind}`)}
          </caption>
          <thead className="bg-black/30 text-xs tracking-wider text-ui-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("wheel.gems.workshop.modifier")}
              </th>
              <th scope="col" className="w-28 px-3 py-3 font-medium">
                {t("wheel.gems.workshop.currentGrade")}
              </th>
              <th scope="col" className="w-32 px-3 py-3 font-medium">
                {t("wheel.gems.workshop.collection")}
              </th>
              <th
                scope="col"
                className="w-36 px-3 py-3 text-right font-medium"
              >
                {t("wheel.gems.workshop.upgradeCost")}
              </th>
              <th
                scope="col"
                className="w-28 px-4 py-3 text-right font-medium"
              >
                {t("wheel.gems.workshop.action")}
              </th>
            </tr>
          </thead>
          <tbody>
            {mods.map((mod) => {
              const grade =
                grades.find((entry) => entry.modId === mod.id)?.grade ?? 0;
              const maxed = grade >= GEM_ATELIER_LIMITS.maxGrade;
              const cost = maxed ? null : GEM_GRADE_COSTS[kind][grade];
              const owned = carriedCount(mod.id);
              const isSocketed = socketed(mod.id);
              const hasGold = cost
                ? gems.resources.gold >= cost.gold
                : true;
              const hasFragments = cost
                ? fragments >= cost.fragments
                : true;
              const lines = gemModLines(kind, mod.id, grade, vocation);

              return (
                <tr
                  key={mod.id}
                  className="border-t border-ui-stone-light/10 transition-colors even:bg-black/10 hover:bg-white/3"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded border border-ui-gold/15 bg-black/30 shadow-inner shadow-black/50">
                        <GemSheetIcon
                          style={
                            kind === "basic"
                              ? basicModIconStyle(mod.id)
                              : supremeModIconStyle(mod.id)
                          }
                        />
                      </span>
                      <span className="min-w-0">
                        {mod.name && (
                          <span className="block font-display text-ui-text-bright">
                            {mod.name}
                          </span>
                        )}
                        <span
                          className={`block whitespace-pre-line ${
                            mod.name ? "text-ui-muted" : "text-ui-text-bright"
                          }`}
                        >
                          {lines.join("\n")}
                        </span>
                      </span>
                    </span>
                  </th>
                  <td className="px-3 py-3">
                    <span className="inline-flex min-w-20 justify-center rounded-full border border-ui-gold/25 bg-ui-gold/10 px-2 py-1 font-display text-xs text-ui-gold">
                      {t("wheel.gems.grade", {
                        grade: GRADE_NUMERALS[grade],
                      })}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="block tabular-nums text-ui-text-bright">
                      {t("wheel.gems.workshop.onGems", { count: owned })}
                    </span>
                    {isSocketed && (
                      <span className="mt-1 inline-flex rounded-full border border-ui-accent-light/25 bg-ui-accent/10 px-2 py-0.5 text-xs text-ui-accent-light">
                        {t("wheel.gems.workshop.socketed")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {cost ? (
                      <span className="flex flex-col items-end gap-1 text-xs tabular-nums">
                        <span
                          className={`flex items-center gap-1.5 ${
                            hasGold ? "text-ui-gold" : "text-ui-accent-light"
                          }`}
                        >
                          <Image
                            src="/assets/cyclopedia/currency/gold.png"
                            alt=""
                            aria-hidden
                            width={12}
                            height={12}
                            className="[image-rendering:pixelated]"
                          />
                          {cost.gold.toLocaleString(i18n.language)}
                        </span>
                        <span
                          className={`flex items-center gap-1.5 ${
                            hasFragments
                              ? "text-ui-text"
                              : "text-ui-accent-light"
                          }`}
                        >
                          <GemSheetIcon
                            style={fragmentIconStyle(fragmentKind)}
                          />
                          {cost.fragments.toLocaleString(i18n.language)}
                        </span>
                      </span>
                    ) : (
                      <span className="block text-right text-ui-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {cost ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={pending || !hasFragments || !hasGold}
                        onClick={() =>
                          onAction({
                            kind: "improve-grade",
                            modKind: kind,
                            modId: mod.id,
                          })
                        }
                      >
                        {t("wheel.gems.workshop.improve")}
                      </Button>
                    ) : (
                      <span className="inline-flex rounded-full border border-ui-stone-light/15 bg-black/20 px-2 py-1 text-xs text-ui-muted">
                        {t("wheel.gems.workshop.maxed")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
