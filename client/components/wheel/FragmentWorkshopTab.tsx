"use client";

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
  const { t } = useAppTranslation();
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <GemResourceBar resources={gems.resources} />
        <div role="tablist" aria-label={t("wheel.gems.workshop.kinds")} className="flex gap-1">
          {(["basic", "supreme"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              className={`ui-button rounded border px-3 py-1 text-xs ${
                kind === value
                  ? "ui-button-primary border-ui-accent-light/50 text-ui-text-bright"
                  : "ui-button-secondary border-ui-stone-light/15 text-ui-muted"
              }`}
            >
              {t(`wheel.gems.workshop.${value}`)}
            </button>
          ))}
        </div>
        {error && (
          <span className="text-xs text-ui-accent-light">
            {t(`wheel.gems.errors.${error}`)}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {mods.map((mod) => {
          const grade = grades.find((entry) => entry.modId === mod.id)?.grade ?? 0;
          const maxed = grade >= GEM_ATELIER_LIMITS.maxGrade;
          const cost = maxed ? null : GEM_GRADE_COSTS[kind][grade];
          const owned = carriedCount(mod.id);
          return (
            <li
              key={mod.id}
              className="flex items-center gap-3 rounded border border-ui-stone-light/10 bg-black/25 px-3 py-2 text-xs"
            >
              <GemSheetIcon
                style={
                  kind === "basic"
                    ? basicModIconStyle(mod.id)
                    : supremeModIconStyle(mod.id)
                }
              />
              <span className="min-w-0 flex-1 whitespace-pre-line">
                {mod.name && (
                  <span className="block font-display text-ui-text-bright">
                    {mod.name}
                  </span>
                )}
                {gemModLines(kind, mod.id, grade, vocation).join("\n")}
              </span>
              <span className="w-20 shrink-0 text-center">
                <span className="block text-ui-gold">
                  {t("wheel.gems.grade", { grade: GRADE_NUMERALS[grade] })}
                </span>
                <span className="block text-[10px] text-ui-muted">
                  {t("wheel.gems.workshop.onGems", { count: owned })}
                  {socketed(mod.id) && ` · ${t("wheel.gems.workshop.socketed")}`}
                </span>
              </span>
              {cost ? (
                <span className="flex w-40 shrink-0 items-center justify-end gap-2">
                  <span className="text-right text-[10px] leading-4">
                    <span className="block text-ui-gold">
                      {cost.gold.toLocaleString()}
                    </span>
                    <span className="flex items-center justify-end gap-1">
                      <GemSheetIcon style={fragmentIconStyle(fragmentKind)} />
                      {cost.fragments}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    disabled={
                      pending ||
                      fragments < cost.fragments ||
                      gems.resources.gold < cost.gold
                    }
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
                </span>
              ) : (
                <span className="w-40 shrink-0 text-right text-[10px] text-ui-muted">
                  {t("wheel.gems.workshop.maxed")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
