"use client";

import { useState } from "react";
import {
  PREY_RULES,
  type PreyActionMessage,
  type PreyOption,
  type PreySlot,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatPreyDuration } from "../../lib/prey/formatPreyDuration";
import { Checkbox } from "../ui/Checkbox";
import { PreyActionCard, type PreyActionCardImage } from "./PreyActionCard";
import { PreyBonusFlag } from "./PreyBonusFlag";
import { PreyCostPlate } from "./PreyCostPlate";
import { PreyCreatureSprite } from "./PreyCreatureSprite";
import { PREY_UI_SCALE } from "./preyUiScale";

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
const OPTION_COSTS: Record<Exclude<PreyOption, "none">, number> = {
  "auto-reroll": PREY_RULES.autoRerollPrice,
  lock: PREY_RULES.lockPrice,
};

const REROLL_IMAGE: PreyActionCardImage = {
  src: "ui/prey/prey_reroll.png",
  sheetWidth: 60,
  sheetHeight: 92,
  x: 1,
  y: 0,
  width: 58,
  height: 45,
};
const REROLL_BLOCKED: PreyActionCardImage = {
  src: "ui/prey/prey_reroll_blocked.png",
  sheetWidth: 58,
  sheetHeight: 45,
};
const SELECT_IMAGE: PreyActionCardImage = {
  src: "ui/prey/prey_select.png",
  sheetWidth: 64,
  sheetHeight: 64,
};
const SELECT_BLOCKED: PreyActionCardImage = {
  src: "ui/prey/prey_select_blocked.png",
  sheetWidth: 64,
  sheetHeight: 64,
};
const BONUS_REROLL_IMAGE: PreyActionCardImage = {
  src: "ui/prey/prey_bonus_reroll.png",
  sheetWidth: 37,
  sheetHeight: 106,
  x: 1,
  y: 0,
  width: 35,
  height: 52,
};
const CHOOSE_IMAGE: PreyActionCardImage = {
  src: "ui/prey/prey_choose.png",
  sheetWidth: 46,
  sheetHeight: 73,
  x: 1,
  y: 0,
  width: 44,
  height: 35,
};
const CHOOSE_BLOCKED: PreyActionCardImage = {
  src: "ui/prey/prey_choose_blocked.png",
  sheetWidth: 44,
  sheetHeight: 35,
};

/**
 * One prey slot rebuilt on the OTClient art (prey.otui): creature box with
 * the bonus flag, gold time bar, the reroll/select/bonus-reroll cards with
 * price plates, and the Auto Bonus Reroll / Lock Prey checkbox rows. Grid
 * picks are confirmed with the checkmark card like Tibia. Every control
 * only sends an intent; states, balances, and grid membership are
 * re-validated server-side at execution time.
 */
export function PreySlotCard({
  slot,
  wildcards,
  listRerollPriceGold,
  pending,
  onAction,
}: PreySlotCardProps) {
  const { t } = useAppTranslation();
  const scale = PREY_UI_SCALE;
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const showGrid =
    slot.state === "selection" ||
    slot.state === "selection-change-monster" ||
    slot.state === "inactive";
  const listRerollFree = slot.freeRerollInSeconds === 0;
  const title =
    slot.state === "active" && slot.selected
      ? slot.selected.name
      : slot.state === "selection" || slot.state === "selection-change-monster"
        ? t("prey.selectTitle")
        : t(`prey.states.${slot.state}`);
  const timePercent = Math.min(
    100,
    (slot.bonusTimeLeftSeconds / PREY_RULES.bonusTimeSeconds) * 100,
  );

  const rerollCard = (
    <PreyActionCard
      label={`${t("prey.listReroll")} · ${
        listRerollFree
          ? t("prey.cost.free")
          : t("prey.cost.gold", { gold: listRerollPriceGold })
      }`}
      image={REROLL_IMAGE}
      blockedImage={REROLL_BLOCKED}
      disabled={pending}
      onClick={() => onAction("list-reroll")}
      plate={
        <>
          <span
            className="flex w-full items-center justify-center border border-black/80 bg-black/60 text-sm leading-none tabular-nums text-ui-text-bright"
            style={{ height: 15 * scale }}
          >
            {listRerollFree
              ? t("prey.cost.free")
              : formatPreyDuration(slot.freeRerollInSeconds)}
          </span>
          <PreyCostPlate
            value={listRerollPriceGold.toLocaleString()}
            icon="gold"
            struck={listRerollFree}
          />
        </>
      }
    />
  );
  const selectCard = (
    <PreyActionCard
      label={`${t("prey.wildcardList")} · ${t("prey.cost.wildcards", {
        count: PREY_RULES.wildcardListPrice,
      })}`}
      image={SELECT_IMAGE}
      blockedImage={SELECT_BLOCKED}
      disabled={
        pending ||
        slot.state === "list-selection" ||
        wildcards < PREY_RULES.wildcardListPrice
      }
      onClick={() => onAction("wildcard-list")}
      plate={
        <PreyCostPlate
          value={`${PREY_RULES.wildcardListPrice}`}
          icon="wildcard"
        />
      }
    />
  );

  return (
    <section
      aria-label={t("prey.slotLabel", { slot: slot.slot + 1 })}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-ui-stone-light/15 bg-black/20"
      style={{ width: 210 * scale }}
    >
      <header className="truncate border-b border-ui-stone-light/15 bg-black/40 px-2 py-1.5 text-center font-display text-sm font-bold tracking-wide text-ui-text/90">
        {title}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {slot.state === "locked" && (
          <>
            <div className="flex gap-2">
              <div
                className="flex items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40"
                style={{ width: 124 * scale, height: 124 * scale }}
              >
                <span
                  aria-hidden
                  className="font-display text-5xl text-ui-muted/60"
                >
                  ?
                </span>
              </div>
              <div className="flex flex-1 justify-center">
                <PreyBonusFlag
                  variant="locked"
                  stars={0}
                  maxStars={PREY_RULES.maxBonusRarity}
                  label={t("prey.states.locked")}
                />
              </div>
            </div>
            {slot.unlock && (
              <p className="rounded-sm border border-ui-gold/30 bg-ui-gold-deep/30 px-3 py-3 text-center text-sm text-ui-text-bright">
                {t(`prey.unlock.${slot.unlock}`)}
              </p>
            )}
          </>
        )}

        {showGrid && (
          <>
            {slot.grid.length === 0 ? (
              <p className="flex flex-1 items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40 px-3 py-8 text-center text-sm text-ui-muted">
                {t("prey.emptyGrid")}
              </p>
            ) : (
              <ul
                className="grid grid-cols-3 justify-items-center gap-1 rounded-sm border border-ui-stone-light/15 bg-black/40 p-1.5"
                role="radiogroup"
                aria-label={t("prey.selectTitle")}
              >
                {slot.grid.map((monster, index) => (
                  <li key={monster.raceId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={pickedIndex === index}
                      disabled={pending}
                      aria-label={t("prey.selectMonster", {
                        name: monster.name,
                      })}
                      title={monster.name}
                      onClick={() =>
                        setPickedIndex(pickedIndex === index ? null : index)
                      }
                      className={`flex items-center justify-center border transition-colors disabled:cursor-not-allowed ${
                        pickedIndex === index
                          ? "border-white"
                          : "border-transparent hover:border-ui-gold/40"
                      }`}
                      style={{ width: 60 * scale, height: 60 * scale }}
                    >
                      <PreyCreatureSprite
                        lookTypeId={monster.lookTypeId}
                        fit={Math.round(48 * scale)}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex justify-end gap-1">
              {rerollCard}
              {selectCard}
              <PreyActionCard
                label={t("prey.confirmPick")}
                image={CHOOSE_IMAGE}
                narrow
                blockedImage={CHOOSE_BLOCKED}
                disabled={pending || pickedIndex === null}
                onClick={() => {
                  if (pickedIndex === null) return;
                  onAction("select-monster", { index: pickedIndex });
                  setPickedIndex(null);
                }}
              />
            </div>
          </>
        )}

        {slot.state === "active" && slot.selected && (
          <>
            <div className="flex gap-2">
              <div
                className="flex items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40"
                style={{ width: 124 * scale, height: 124 * scale }}
              >
                <PreyCreatureSprite
                  lookTypeId={slot.selected.lookTypeId}
                  fit={Math.round(96 * scale)}
                />
              </div>
              <div className="flex flex-1 justify-center">
                <PreyBonusFlag
                  variant={slot.bonus?.type ?? "none"}
                  stars={slot.bonus?.rarity ?? 0}
                  maxStars={PREY_RULES.maxBonusRarity}
                  label={
                    slot.bonus
                      ? `${t(`prey.bonus.${slot.bonus.type}`)} ${t(
                          "prey.bonusValue",
                          { percentage: slot.bonus.percentage },
                        )} · ${t("prey.stars", {
                          value: slot.bonus.rarity,
                          max: PREY_RULES.maxBonusRarity,
                        })}`
                      : t("prey.states.active")
                  }
                  footer={
                    slot.bonus
                      ? t("prey.bonusValue", {
                          percentage: slot.bonus.percentage,
                        })
                      : undefined
                  }
                />
              </div>
            </div>
            <div
              role="progressbar"
              aria-label={t("prey.timeLeft", {
                time: formatPreyDuration(slot.bonusTimeLeftSeconds),
              })}
              aria-valuemin={0}
              aria-valuemax={PREY_RULES.bonusTimeSeconds}
              aria-valuenow={slot.bonusTimeLeftSeconds}
              className="relative shrink-0 overflow-hidden rounded-sm border border-ui-stone-light/15 bg-black/45"
              style={{ height: 20 * scale }}
            >
              <div
                className="h-full bg-ui-gold-deep/80"
                style={{ width: `${timePercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-sm leading-none tabular-nums text-ui-text-bright [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                {formatPreyDuration(slot.bonusTimeLeftSeconds)}
              </span>
            </div>
            <div className="flex justify-end gap-1">
              {rerollCard}
              {selectCard}
              <PreyActionCard
                label={`${t("prey.bonusReroll")} · ${t("prey.cost.wildcards", {
                  count: PREY_RULES.bonusRerollPrice,
                })}`}
                image={BONUS_REROLL_IMAGE}
                narrow
                disabled={pending || wildcards < PREY_RULES.bonusRerollPrice}
                onClick={() => onAction("bonus-reroll")}
                plate={
                  <PreyCostPlate
                    value={`${PREY_RULES.bonusRerollPrice}`}
                    icon="wildcard"
                  />
                }
              />
            </div>
            <div
              role="group"
              aria-label={t("prey.optionLabel")}
              className="flex flex-col gap-1"
            >
              {(["auto-reroll", "lock"] as const).map((option) => {
                const active = slot.option === option;
                const affordable = wildcards >= OPTION_COSTS[option];
                return (
                  <span
                    key={option}
                    className="flex items-center justify-between gap-2 rounded-sm border border-ui-stone-light/15 bg-black/25 py-0.5 pr-0.5 pl-1.5"
                  >
                    <Checkbox
                      label={
                        <span className="text-sm text-ui-text/90">
                          {t(`prey.options.${option}`)}
                        </span>
                      }
                      checked={active}
                      readOnly
                      disabled={pending || (!active && !affordable)}
                      onClick={(event) => {
                        // The visual is server state; never toggle locally.
                        event.preventDefault();
                        onAction("set-option", {
                          option: active ? "none" : option,
                        });
                      }}
                    />
                    <span style={{ width: 60 * scale }}>
                      <PreyCostPlate
                        value={`${OPTION_COSTS[option]}`}
                        icon="wildcard"
                        label={t("prey.cost.wildcardsPerExpiry", {
                          count: OPTION_COSTS[option],
                        })}
                      />
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        )}

        {slot.state === "list-selection" && (
          <>
            <p className="flex flex-1 items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40 px-3 py-8 text-center text-sm text-ui-muted">
              {t("prey.listSelectionHint")}
            </p>
            <div className="flex justify-end gap-1">
              {rerollCard}
              {selectCard}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
