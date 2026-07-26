"use client";

import {
  TASK_HUNTING_RULES,
  taskDifficultyForStars,
  taskHuntingOptionFor,
  type TaskHuntingActionMessage,
  type TaskHuntingSlot,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatPreyDuration } from "../../lib/prey/formatPreyDuration";
import { Button } from "../ui/Button";
import { PreyCreatureSprite } from "../prey/PreyCreatureSprite";
import { RarityStars } from "../prey/RarityStars";

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

/**
 * One hunting-task slot as the server projected it. Goals and rewards come
 * from the shared option table for display; kills, claims, and exhausts are
 * all server-enforced at execution time.
 */
export function HuntingTaskSlotCard({
  slot,
  rerollPriceGold,
  pending,
  onAction,
}: HuntingTaskSlotCardProps) {
  const { t } = useAppTranslation();
  const exhausted = slot.disabledForSeconds > 0;
  const showFooter =
    slot.state === "selection" ||
    slot.state === "list-selection" ||
    slot.state === "inactive";
  const listRerollFree = slot.freeRerollInSeconds === 0;
  const goal = slot.goalKills ?? 0;
  const progressPercent =
    goal > 0 ? Math.min(100, (slot.kills / goal) * 100) : 0;
  const activeOption = slot.selected
    ? taskHuntingOptionFor(slot.selected.stars, slot.rarity)
    : undefined;

  return (
    <section
      aria-label={t("huntingTasks.slotLabel", { slot: slot.slot + 1 })}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-ui-gold/15 bg-black/20 p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-wide text-ui-text-bright">
          {t("huntingTasks.slotLabel", { slot: slot.slot + 1 })}
        </h3>
        <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-xs tracking-wide text-ui-muted uppercase">
          {t(`huntingTasks.states.${slot.state}`)}
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
              {t(`huntingTasks.unlock.${slot.unlock}`)}
            </p>
          )}
        </div>
      )}

      {slot.state === "inactive" && (
        <p className="py-4 text-center text-sm tabular-nums text-ui-muted">
          {exhausted
            ? t("huntingTasks.exhaustedFor", {
                time: formatPreyDuration(slot.disabledForSeconds),
              })
            : t("huntingTasks.emptyGrid")}
        </p>
      )}

      {slot.state === "selection" && (
        <>
          <p className="text-center">
            <RarityStars
              value={slot.rarity}
              max={TASK_HUNTING_RULES.maxStars}
              label={t("huntingTasks.rarity", {
                value: slot.rarity,
                max: TASK_HUNTING_RULES.maxStars,
              })}
            />
          </p>
          {slot.grid.length === 0 ? (
            <p className="py-4 text-center text-sm text-ui-muted">
              {t("huntingTasks.emptyGrid")}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5">
              {slot.grid.map((entry) => {
                const option = taskHuntingOptionFor(entry.stars, slot.rarity);
                return (
                  <li
                    key={entry.raceId}
                    className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-ui-stone-light/15 bg-black/25 p-2"
                  >
                    <span className="flex h-9 items-center justify-center">
                      <PreyCreatureSprite
                        lookTypeId={entry.lookTypeId}
                        fit={32}
                      />
                    </span>
                    <span
                      title={entry.name}
                      className="w-full truncate text-center text-xs text-ui-text/85"
                    >
                      {entry.name}
                    </span>
                    <RarityStars
                      value={entry.stars}
                      max={TASK_HUNTING_RULES.maxStars}
                      label={t("huntingTasks.stars", {
                        value: entry.stars,
                        max: TASK_HUNTING_RULES.maxStars,
                      })}
                    />
                    <span className="text-xs tracking-wide text-ui-muted uppercase">
                      {t(
                        `huntingTasks.difficulty.${taskDifficultyForStars(entry.stars)}`,
                      )}
                    </span>
                    {option && (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`${t("huntingTasks.selectTask", { name: entry.name })} · ${t("huntingTasks.tierFirst")}`}
                          onClick={() =>
                            onAction("select-monster", {
                              raceId: entry.raceId,
                              upgrade: false,
                            })
                          }
                          className="w-full rounded-md border border-ui-stone-light/15 bg-black/30 px-1 py-0.5 text-xs tabular-nums text-ui-text/85 transition-colors hover:border-ui-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("huntingTasks.tier", {
                            kills: option.firstKills,
                            points: option.firstReward,
                          })}
                        </button>
                        <button
                          type="button"
                          disabled={pending || !entry.upgradeUnlocked}
                          aria-label={`${t("huntingTasks.selectTask", { name: entry.name })} · ${t("huntingTasks.tierSecond")}`}
                          title={
                            entry.upgradeUnlocked
                              ? t("huntingTasks.tierSecond")
                              : t("huntingTasks.upgradeLocked")
                          }
                          onClick={() =>
                            onAction("select-monster", {
                              raceId: entry.raceId,
                              upgrade: true,
                            })
                          }
                          className="w-full rounded-md border border-ui-gold/25 bg-ui-gold-deep/20 px-1 py-0.5 text-xs tabular-nums text-ui-gold transition-colors hover:border-ui-gold/50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t("huntingTasks.tier", {
                            kills: option.secondKills,
                            points: option.secondReward,
                          })}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {slot.state === "list-selection" && (
        <p className="py-4 text-center text-sm text-ui-muted">
          {t("huntingTasks.listSelectionHint")}
        </p>
      )}

      {(slot.state === "active" || slot.state === "completed") &&
        slot.selected && (
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
            <RarityStars
              value={slot.rarity}
              max={TASK_HUNTING_RULES.maxStars}
              label={t("huntingTasks.rarity", {
                value: slot.rarity,
                max: TASK_HUNTING_RULES.maxStars,
              })}
            />
            {goal > 0 && (
              <div className="flex w-full flex-col gap-1">
                <div
                  role="progressbar"
                  aria-label={t("huntingTasks.progress", {
                    kills: slot.kills,
                    goal,
                  })}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(slot.kills, goal)}
                  className="h-2 overflow-hidden rounded-full bg-black/40"
                >
                  <div
                    className="h-full rounded-full bg-ui-gold"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs tabular-nums text-ui-muted">
                  {t("huntingTasks.progress", { kills: slot.kills, goal })}
                </p>
              </div>
            )}
            {slot.goalPoints !== null && slot.state === "active" && (
              <p className="text-sm tabular-nums text-ui-muted">
                {t("huntingTasks.rewardPoints", {
                  points: slot.goalPoints,
                })}
              </p>
            )}
            {activeOption && slot.state === "active" && (
              <p className="text-xs tracking-wide text-ui-muted uppercase">
                {t(`huntingTasks.difficulty.${activeOption.difficulty}`)}
                {slot.upgrade ? ` · ${t("huntingTasks.tierSecond")}` : ""}
              </p>
            )}
            {slot.state === "active" && (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onAction("star-reroll")}
                >
                  {t("huntingTasks.starReroll")} ·{" "}
                  {t("huntingTasks.cost.wildcards", {
                    count: TASK_HUNTING_RULES.starRerollPrice,
                  })}
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onAction("cancel")}
                >
                  {t("huntingTasks.cancel")} ·{" "}
                  {t("huntingTasks.cost.gold", { gold: rerollPriceGold })}
                </Button>
              </>
            )}
            {slot.state === "completed" && (
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => onAction("claim")}
              >
                {t("huntingTasks.claim", { points: slot.goalPoints ?? 0 })}
              </Button>
            )}
          </div>
        )}

      {showFooter && (
        <footer className="mt-auto flex flex-col gap-1.5 border-t border-ui-stone-light/10 pt-2">
          <Button
            size="sm"
            disabled={pending || exhausted}
            onClick={() => onAction("list-reroll")}
          >
            {t("huntingTasks.listReroll")} ·{" "}
            {listRerollFree
              ? t("huntingTasks.cost.free")
              : t("huntingTasks.cost.gold", { gold: rerollPriceGold })}
          </Button>
          {!listRerollFree && !exhausted && (
            <p className="text-center text-xs tabular-nums text-ui-muted">
              {t("huntingTasks.freeRerollIn", {
                time: formatPreyDuration(slot.freeRerollInSeconds),
              })}
            </p>
          )}
          <Button
            size="sm"
            disabled={pending || exhausted || slot.state === "list-selection"}
            onClick={() => onAction("wildcard-list")}
          >
            {t("huntingTasks.wildcardList")} ·{" "}
            {t("huntingTasks.cost.wildcards", {
              count: TASK_HUNTING_RULES.wildcardListPrice,
            })}
          </Button>
        </footer>
      )}
    </section>
  );
}
