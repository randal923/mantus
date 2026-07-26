"use client";

import {
  PREY_OPTIONS,
  PREY_RULES,
  type PreyActionMessage,
  type PreyOption,
  type PreySlot,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatPreyDuration } from "../../lib/prey/formatPreyDuration";
import { Button } from "../ui/Button";
import { PreyCreatureSprite } from "./PreyCreatureSprite";
import { RarityStars } from "./RarityStars";

export interface PreySlotActionExtras {
  index?: number;
  raceId?: number;
  option?: PreyOption;
}

interface PreySlotCardProps {
  slot: PreySlot;
  /** Server-sent wildcard balance; used only to disable unaffordable buttons. */
  wildcards: number;
  /** Server-computed gold price of a paid list reroll. */
  listRerollPriceGold: number;
  pending: boolean;
  onAction: (
    action: PreyActionMessage["action"],
    extras?: PreySlotActionExtras,
  ) => void;
}

/** Wildcards charged per expiry for each slot option (display constants). */
const OPTION_COSTS: Record<PreyOption, number> = {
  none: 0,
  "auto-reroll": PREY_RULES.autoRerollPrice,
  lock: PREY_RULES.lockPrice,
};

/**
 * One prey slot as the server projected it. Every button only sends an
 * intent; states, balances, and grid membership are re-validated server-side
 * at execution time.
 */
export function PreySlotCard({
  slot,
  wildcards,
  listRerollPriceGold,
  pending,
  onAction,
}: PreySlotCardProps) {
  const { t } = useAppTranslation();
  const showGrid =
    slot.state === "selection" ||
    slot.state === "selection-change-monster" ||
    slot.state === "inactive";
  const listRerollFree = slot.freeRerollInSeconds === 0;

  return (
    <section
      aria-label={t("prey.slotLabel", { slot: slot.slot + 1 })}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-ui-gold/15 bg-black/20 p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-wide text-ui-text-bright">
          {t("prey.slotLabel", { slot: slot.slot + 1 })}
        </h3>
        <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-xs tracking-wide text-ui-muted uppercase">
          {t(`prey.states.${slot.state}`)}
        </span>
      </header>

      {slot.state === "locked" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-8 text-ui-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5.5" y="10.5" width="13" height="9" rx="1.5" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
          </svg>
          {slot.unlock && (
            <p className="text-sm text-ui-muted">
              {t(`prey.unlock.${slot.unlock}`)}
            </p>
          )}
        </div>
      )}

      {showGrid && slot.bonus && (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-ui-gold/15 bg-black/25 px-2 py-1.5 text-center text-xs text-ui-text/85">
          <span className="text-ui-muted">{t("prey.currentBonus")}:</span>
          <span className="text-ui-gold">
            {t(`prey.bonus.${slot.bonus.type}`)}{" "}
            {t("prey.bonusValue", { percentage: slot.bonus.percentage })}
          </span>
          <RarityStars
            value={slot.bonus.rarity}
            max={PREY_RULES.maxBonusRarity}
            label={t("prey.stars", {
              value: slot.bonus.rarity,
              max: PREY_RULES.maxBonusRarity,
            })}
          />
        </p>
      )}

      {showGrid &&
        (slot.grid.length === 0 ? (
          <p className="py-4 text-center text-sm text-ui-muted">
            {t("prey.emptyGrid")}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-1.5">
            {slot.grid.map((monster, index) => (
              <li key={monster.raceId} className="min-w-0">
                <button
                  type="button"
                  disabled={pending}
                  aria-label={t("prey.selectMonster", { name: monster.name })}
                  title={monster.name}
                  onClick={() => onAction("select-monster", { index })}
                  className="flex w-full flex-col items-center gap-1 rounded-lg border border-ui-stone-light/15 bg-black/25 p-2 transition-colors hover:border-ui-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex h-10 items-center justify-center">
                    <PreyCreatureSprite
                      lookTypeId={monster.lookTypeId}
                      fit={36}
                    />
                  </span>
                  <span className="w-full truncate text-center text-xs text-ui-text/85">
                    {monster.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {slot.state === "active" && slot.selected && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-16 items-center justify-center">
            <PreyCreatureSprite
              lookTypeId={slot.selected.lookTypeId}
              fit={56}
            />
          </span>
          <p className="text-sm font-bold text-ui-text-bright">
            {slot.selected.name}
          </p>
          {slot.bonus && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm text-ui-gold">
                {t(`prey.bonus.${slot.bonus.type}`)}{" "}
                {t("prey.bonusValue", { percentage: slot.bonus.percentage })}
              </p>
              <RarityStars
                value={slot.bonus.rarity}
                max={PREY_RULES.maxBonusRarity}
                label={t("prey.stars", {
                  value: slot.bonus.rarity,
                  max: PREY_RULES.maxBonusRarity,
                })}
              />
            </div>
          )}
          <p className="text-sm tabular-nums text-ui-muted">
            {t("prey.timeLeft", {
              time: formatPreyDuration(slot.bonusTimeLeftSeconds),
            })}
          </p>
          <Button
            size="sm"
            disabled={pending || wildcards < PREY_RULES.bonusRerollPrice}
            onClick={() => onAction("bonus-reroll")}
          >
            {t("prey.bonusReroll")} ·{" "}
            {t("prey.cost.wildcards", {
              count: PREY_RULES.bonusRerollPrice,
            })}
          </Button>
          <div
            role="group"
            aria-label={t("prey.optionLabel")}
            className="flex w-full flex-col gap-1"
          >
            <p className="text-xs tracking-wide text-ui-muted uppercase">
              {t("prey.optionLabel")}
            </p>
            {PREY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={slot.option === option}
                disabled={pending || slot.option === option}
                onClick={() => onAction("set-option", { option })}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors disabled:cursor-not-allowed ${
                  slot.option === option
                    ? "border-ui-gold/50 bg-ui-gold-deep/30 text-ui-text-bright"
                    : "border-ui-stone-light/15 bg-black/25 text-ui-text/85 hover:border-ui-gold/40 disabled:opacity-40"
                }`}
              >
                <span>{t(`prey.options.${option}`)}</span>
                <span className="text-xs tabular-nums text-ui-muted">
                  {OPTION_COSTS[option] === 0
                    ? t("prey.cost.free")
                    : t("prey.cost.wildcardsPerExpiry", {
                        count: OPTION_COSTS[option],
                      })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {slot.state === "list-selection" && (
        <p className="py-4 text-center text-sm text-ui-muted">
          {t("prey.listSelectionHint")}
        </p>
      )}

      {slot.state !== "locked" && (
        <footer className="mt-auto flex flex-col gap-1.5 border-t border-ui-stone-light/10 pt-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onAction("list-reroll")}
          >
            {t("prey.listReroll")} ·{" "}
            {listRerollFree
              ? t("prey.cost.free")
              : t("prey.cost.gold", { gold: listRerollPriceGold })}
          </Button>
          {!listRerollFree && (
            <p className="text-center text-xs tabular-nums text-ui-muted">
              {t("prey.freeRerollIn", {
                time: formatPreyDuration(slot.freeRerollInSeconds),
              })}
            </p>
          )}
          <Button
            size="sm"
            disabled={
              pending ||
              slot.state === "list-selection" ||
              wildcards < PREY_RULES.wildcardListPrice
            }
            onClick={() => onAction("wildcard-list")}
          >
            {t("prey.wildcardList")} ·{" "}
            {t("prey.cost.wildcards", {
              count: PREY_RULES.wildcardListPrice,
            })}
          </Button>
        </footer>
      )}
    </section>
  );
}
