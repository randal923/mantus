"use client";

import type { DailyRewardPoolEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface DailyRewardPickPanelProps {
  pool: ReadonlyArray<DailyRewardPoolEntry>;
  picks: ReadonlyMap<number, number>;
  pickedUnits: number;
  allowance: number;
  onAdjust: (itemTypeId: number, delta: number) => void;
}

/**
 * Today's pickable items. The unit budget shown here is the server's own
 * allowance, and it re-checks pool membership and the total on claim — this
 * panel only keeps the player from asking for something it would refuse.
 */
export function DailyRewardPickPanel({
  pool,
  picks,
  pickedUnits,
  allowance,
  onAdjust,
}: DailyRewardPickPanelProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-label={t("dailyRewards.pickTitle")}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-ui-stone-light/15 bg-black/20"
    >
      <header className="flex items-center justify-between gap-2 border-b border-ui-stone-light/15 bg-black/40 px-2 py-1.5 font-display text-sm font-bold tracking-wide text-ui-text/90">
        <span className="truncate">{t("dailyRewards.pickTitle")}</span>
        <span
          className={
            pickedUnits === allowance ? "text-ui-gold" : "text-ui-muted"
          }
        >
          {t("dailyRewards.pickCount", {
            picked: pickedUnits,
            allowance,
          })}
        </span>
      </header>
      <ul className="ui-scrollbar grid max-h-56 grid-cols-1 gap-1 overflow-y-auto p-2 sm:grid-cols-2">
        {pool.map((entry) => {
          const count = picks.get(entry.itemTypeId) ?? 0;
          return (
            <li
              key={entry.itemTypeId}
              className="flex items-center gap-2 rounded-sm border border-ui-stone-light/15 bg-black/25 px-2 py-1"
            >
              <SpriteIcon
                spriteId={entry.spriteId}
                clientId={entry.itemTypeId}
                scale={0.9}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ui-text">
                {entry.name}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t("dailyRewards.remove", { name: entry.name })}
                  disabled={count === 0}
                  onClick={() => onAdjust(entry.itemTypeId, -1)}
                >
                  −
                </Button>
                <span className="w-6 text-center text-sm text-ui-text-bright">
                  {count}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t("dailyRewards.add", { name: entry.name })}
                  disabled={pickedUnits >= allowance}
                  onClick={() => onAdjust(entry.itemTypeId, 1)}
                >
                  +
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
