"use client";

import type { BosstiaryEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { LazyMount } from "./LazyMount";

interface BossSlotPickerProps {
  /** Unlocked bosses only, already resolved through the cached bosstiary. */
  bosses: ReadonlyArray<BosstiaryEntry>;
  pending: boolean;
  onPick: (raceId: number) => void;
  onCancel: () => void;
}

/** Grid of assignable bosses (races the server listed as unlocked). */
export function BossSlotPicker({
  bosses,
  pending,
  onPick,
  onCancel,
}: BossSlotPickerProps) {
  const { t } = useAppTranslation();

  return (
    <div className="ui-panel-inset rounded-sm border border-ui-gold/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs tracking-widest text-ui-gold uppercase">
          {t("bossSlots.pickerTitle")}
        </h4>
        <Button size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
      {bosses.length === 0 ? (
        <p className="py-6 text-center text-sm text-ui-muted">
          {t("bossSlots.noneUnlocked")}
        </p>
      ) : (
        <ul className="ui-scrollbar mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {bosses.map((boss) => (
            <li key={boss.raceId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(boss.raceId)}
                className="flex w-full flex-col items-center gap-1 rounded-sm border border-ui-stone-light/15 bg-black/25 p-2 transition-[border-color,background-color] hover:border-ui-gold/45 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LazyMount placeholderHeight={56}>
                  <AnimatedOutfit outfit={boss.outfit} fit={56} />
                </LazyMount>
                <span className="w-full truncate text-xs text-ui-text-bright capitalize">
                  {boss.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
