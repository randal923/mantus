"use client";

import { useState } from "react";
import {
  TASK_HUNTING_RULES,
  taskDifficultyForStars,
  taskHuntingOptionFor,
  type TaskHuntingActionMessage,
  type TaskHuntingSlot,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatPreyDuration } from "../../lib/prey/formatPreyDuration";
import { PreyActionCard, type PreyActionCardImage } from "../prey/PreyActionCard";
import { PreyBonusFlag } from "../prey/PreyBonusFlag";
import { PreyCostPlate } from "../prey/PreyCostPlate";
import { PreyCreatureSprite } from "../prey/PreyCreatureSprite";
import { PREY_UI_SCALE } from "../prey/preyUiScale";
import { PixelImage } from "../ui/PixelImage";
import { SlotActionButton } from "../prey/SlotActionButton";

export interface HuntingTaskSlotActionExtras {
  raceId?: number;
  upgrade?: boolean;
}

interface HuntingTaskSlotCardProps {
  slot: TaskHuntingSlot;
  /** Server-computed gold price of a paid list reroll or cancel. */
  rerollPriceGold: number;
  pending: boolean;
  onAction: (
    action: TaskHuntingActionMessage["action"],
    extras?: HuntingTaskSlotActionExtras,
  ) => void;
}

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
const STAR_REROLL_IMAGE: PreyActionCardImage = {
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
 * One hunting-task slot rebuilt on the OTClient prey art: the selection
 * grid with Tibia's Amount radios (standard vs. bestiary-gated upgraded
 * goal) confirmed by the checkmark card, and an active view with the star
 * flag, kill progress, star-reroll card, and cancel/claim. Goals and
 * rewards come from the shared option table for display; kills, claims, and
 * exhausts are all server-enforced at execution time.
 */
export function HuntingTaskSlotCard({
  slot,
  rerollPriceGold,
  pending,
  onAction,
}: HuntingTaskSlotCardProps) {
  const { t } = useAppTranslation();
  const scale = PREY_UI_SCALE;
  const [pickedRaceId, setPickedRaceId] = useState<number | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const exhausted = slot.disabledForSeconds > 0;
  const listRerollFree = slot.freeRerollInSeconds === 0;
  const goal = slot.goalKills ?? 0;
  const progressPercent =
    goal > 0 ? Math.min(100, (slot.kills / goal) * 100) : 0;
  const picked = slot.grid.find((entry) => entry.raceId === pickedRaceId);
  const pickedOption = picked
    ? taskHuntingOptionFor(picked.stars, slot.rarity)
    : undefined;
  const title =
    (slot.state === "active" || slot.state === "completed") && slot.selected
      ? slot.selected.name
      : slot.state === "inactive" && exhausted
        ? t("huntingTasks.exhaustedTitle")
        : slot.state === "selection"
          ? t("huntingTasks.selectTitle")
          : t(`huntingTasks.states.${slot.state}`);

  const rerollCard = (
    <PreyActionCard
      label={`${t("huntingTasks.listReroll")} · ${
        listRerollFree
          ? t("huntingTasks.cost.free")
          : t("huntingTasks.cost.gold", { gold: rerollPriceGold })
      }`}
      image={REROLL_IMAGE}
      blockedImage={REROLL_BLOCKED}
      disabled={pending || exhausted}
      onClick={() => onAction("list-reroll")}
      plate={
        <>
          <span
            className="flex w-full items-center justify-center border border-black/80 bg-black/60 text-sm leading-none tabular-nums text-ui-text-bright"
            style={{ height: 15 * scale }}
          >
            {listRerollFree
              ? t("huntingTasks.cost.free")
              : formatPreyDuration(slot.freeRerollInSeconds)}
          </span>
          <PreyCostPlate
            value={rerollPriceGold.toLocaleString()}
            icon="gold"
            struck={listRerollFree}
          />
        </>
      }
    />
  );
  const selectCard = (
    <PreyActionCard
      label={`${t("huntingTasks.wildcardList")} · ${t(
        "huntingTasks.cost.wildcards",
        { count: TASK_HUNTING_RULES.wildcardListPrice },
      )}`}
      image={SELECT_IMAGE}
      blockedImage={SELECT_BLOCKED}
      disabled={pending || exhausted || slot.state === "list-selection"}
      onClick={() => onAction("wildcard-list")}
      plate={
        <PreyCostPlate
          value={`${TASK_HUNTING_RULES.wildcardListPrice}`}
          icon="wildcard"
        />
      }
    />
  );

  return (
    <section
      aria-label={t("huntingTasks.slotLabel", { slot: slot.slot + 1 })}
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
                  maxStars={TASK_HUNTING_RULES.maxStars}
                  label={t("huntingTasks.states.locked")}
                />
              </div>
            </div>
            {slot.unlock && (
              <p className="rounded-sm border border-ui-gold/30 bg-ui-gold-deep/30 px-3 py-3 text-center text-sm text-ui-text-bright">
                {t(`huntingTasks.unlock.${slot.unlock}`)}
              </p>
            )}
          </>
        )}

        {slot.state === "inactive" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-sm border border-ui-stone-light/15 bg-black/40 px-3 py-6 text-center">
            <PixelImage
              src="ui/prey/prey_biginactive.png"
              sheetWidth={57}
              sheetHeight={91}
              scale={scale}
            />
            <p className="text-sm tabular-nums text-ui-muted">
              {exhausted
                ? t("huntingTasks.exhaustedFor", {
                    time: formatPreyDuration(slot.disabledForSeconds),
                  })
                : t("huntingTasks.emptyGrid")}
            </p>
          </div>
        )}

        {slot.state === "selection" && (
          <>
            {slot.grid.length === 0 ? (
              <p className="flex flex-1 items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40 px-3 py-8 text-center text-sm text-ui-muted">
                {t("huntingTasks.emptyGrid")}
              </p>
            ) : (
              <ul
                className="grid grid-cols-3 justify-items-center gap-1 rounded-sm border border-ui-stone-light/15 bg-black/40 p-1.5"
                role="radiogroup"
                aria-label={t("huntingTasks.selectTitle")}
              >
                {slot.grid.map((entry) => (
                  <li key={entry.raceId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={pickedRaceId === entry.raceId}
                      disabled={pending}
                      aria-label={t("huntingTasks.selectTask", {
                        name: entry.name,
                      })}
                      title={`${entry.name} · ${t(
                        `huntingTasks.difficulty.${taskDifficultyForStars(entry.stars)}`,
                      )} (${entry.stars}★)`}
                      onClick={() => {
                        const next =
                          pickedRaceId === entry.raceId ? null : entry.raceId;
                        setPickedRaceId(next);
                        if (
                          next !== null &&
                          !entry.upgradeUnlocked &&
                          upgrade
                        ) {
                          setUpgrade(false);
                        }
                      }}
                      className={`flex items-center justify-center border transition-colors disabled:cursor-not-allowed ${
                        pickedRaceId === entry.raceId
                          ? "border-white"
                          : "border-transparent hover:border-ui-gold/40"
                      }`}
                      style={{ width: 60 * scale, height: 60 * scale }}
                    >
                      <PreyCreatureSprite
                        lookTypeId={entry.lookTypeId}
                        fit={Math.round(48 * scale)}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div
              role="radiogroup"
              aria-label={t("huntingTasks.amountLabel")}
              className="flex items-center gap-3 rounded-sm border border-ui-stone-light/15 bg-black/25 px-2 py-1 text-sm"
            >
              <span className="font-bold text-ui-text/90">
                {t("huntingTasks.amountLabel")}:
              </span>
              {([false, true] as const).map((secondTier) => {
                const kills = secondTier
                  ? pickedOption?.secondKills
                  : pickedOption?.firstKills;
                const points = secondTier
                  ? pickedOption?.secondReward
                  : pickedOption?.firstReward;
                const tierLocked = secondTier && !picked?.upgradeUnlocked;
                return (
                  <button
                    key={String(secondTier)}
                    type="button"
                    role="radio"
                    aria-checked={upgrade === secondTier}
                    disabled={pending || !picked || tierLocked}
                    title={
                      tierLocked
                        ? t("huntingTasks.upgradeLocked")
                        : points !== undefined
                          ? t("huntingTasks.tier", { kills, points })
                          : undefined
                    }
                    onClick={() => setUpgrade(secondTier)}
                    className="flex items-center gap-1.5 tabular-nums disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span
                      aria-hidden
                      className={`size-3.5 rounded-full border ${
                        upgrade === secondTier
                          ? "border-ui-gold bg-ui-gold/70"
                          : "border-ui-stone-light/50 bg-black/50"
                      }`}
                    />
                    <span
                      className={
                        upgrade === secondTier
                          ? "text-ui-text-bright"
                          : "text-ui-muted"
                      }
                    >
                      {kills ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-auto flex justify-end gap-1">
              {rerollCard}
              {selectCard}
              <PreyActionCard
                label={t("huntingTasks.confirmPick")}
                image={CHOOSE_IMAGE}
                narrow
                blockedImage={CHOOSE_BLOCKED}
                disabled={pending || !picked}
                onClick={() => {
                  if (!picked) return;
                  onAction("select-monster", {
                    raceId: picked.raceId,
                    upgrade,
                  });
                  setPickedRaceId(null);
                  setUpgrade(false);
                }}
              />
            </div>
          </>
        )}

        {slot.state === "list-selection" && (
          <>
            <p className="flex flex-1 items-center justify-center rounded-sm border border-ui-stone-light/15 bg-black/40 px-3 py-8 text-center text-sm text-ui-muted">
              {t("huntingTasks.listSelectionHint")}
            </p>
            <div className="flex justify-end gap-1">
              {rerollCard}
              {selectCard}
            </div>
          </>
        )}

        {(slot.state === "active" || slot.state === "completed") &&
          slot.selected && (
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
                    variant="none"
                    stars={slot.rarity}
                    maxStars={TASK_HUNTING_RULES.maxStars}
                    label={`${t("huntingTasks.rarity", {
                      value: slot.rarity,
                      max: TASK_HUNTING_RULES.maxStars,
                    })}${
                      slot.goalPoints !== null
                        ? ` · ${t("huntingTasks.rewardPoints", {
                            points: slot.goalPoints,
                          })}`
                        : ""
                    }`}
                    footer={
                      slot.goalPoints !== null
                        ? `${slot.goalPoints}`
                        : undefined
                    }
                  />
                </div>
              </div>
              {goal > 0 && (
                <div
                  role="progressbar"
                  aria-label={t("huntingTasks.progress", {
                    kills: slot.kills,
                    goal,
                  })}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(slot.kills, goal)}
                  className="relative shrink-0 overflow-hidden rounded-sm border border-ui-stone-light/15 bg-black/45"
                  style={{ height: 20 * scale }}
                >
                  <div
                    className="h-full bg-ui-gold-deep/80"
                    style={{ width: `${progressPercent}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-sm leading-none tabular-nums text-ui-text-bright [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                    {slot.kills} / {goal}
                  </span>
                </div>
              )}
              {slot.state === "active" && (
                <>
                  <div className="flex justify-end gap-1">
                    <PreyActionCard
                      label={`${t("huntingTasks.starReroll")} · ${t(
                        "huntingTasks.cost.wildcards",
                        { count: TASK_HUNTING_RULES.starRerollPrice },
                      )}`}
                      image={STAR_REROLL_IMAGE}
                      narrow
                      disabled={pending}
                      onClick={() => onAction("star-reroll")}
                      plate={
                        <PreyCostPlate
                          value={`${TASK_HUNTING_RULES.starRerollPrice}`}
                          icon="wildcard"
                        />
                      }
                    />
                  </div>
                  <div className="flex">
                    <SlotActionButton
                      label={t("huntingTasks.cancel")}
                      cost={t("huntingTasks.cost.gold", {
                        gold: rerollPriceGold,
                      })}
                      disabled={pending}
                      onClick={() => onAction("cancel")}
                    />
                  </div>
                </>
              )}
              {slot.state === "completed" && (
                <div className="flex">
                  <SlotActionButton
                    label={t("huntingTasks.claim", {
                      points: slot.goalPoints ?? 0,
                    })}
                    primary
                    disabled={pending}
                    onClick={() => onAction("claim")}
                  />
                </div>
              )}
            </>
          )}
      </div>
    </section>
  );
}
