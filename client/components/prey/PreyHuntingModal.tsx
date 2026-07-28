"use client";

import type {
  PreyActionMessage,
  PreyStateMessage,
  TaskHuntingActionMessage,
  TaskHuntingStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import {
  HuntingTaskSlotCard,
  type HuntingTaskSlotActionExtras,
} from "../hunting/HuntingTaskSlotCard";
import { HuntingTaskFullListPanel } from "../hunting/HuntingTaskFullListPanel";
import { Modal } from "../ui/Modal";
import { PixelImage } from "../ui/PixelImage";
import { PreyFullListPanel } from "./PreyFullListPanel";
import { PreySlotCard, type PreySlotActionExtras } from "./PreySlotCard";

export type PreyHuntingTab = "prey" | "hunting-tasks";

interface PreyHuntingModalProps {
  tab: PreyHuntingTab;
  onTabChange: (tab: PreyHuntingTab) => void;
  /** Latest pushed projections; null only until the login push arrives. */
  prey: PreyStateMessage | null;
  preyPending: boolean;
  /** Already-translated failure reason, if any. */
  preyError: string | null;
  onPreyAction: (
    action: PreyActionMessage["action"],
    slot: number,
    extras?: PreySlotActionExtras,
  ) => void;
  tasks: TaskHuntingStateMessage | null;
  tasksPending: boolean;
  tasksError: string | null;
  onTaskAction: (
    action: TaskHuntingActionMessage["action"],
    slot: number,
    extras?: HuntingTaskSlotActionExtras,
  ) => void;
  /** Carried money worth, shown in the balance footer like the Tibia window. */
  gold: number;
  onClose: () => void;
}

/**
 * The combined Prey window, like Tibia's: one dialog with a Prey Creatures
 * tab and a Hunting Tasks tab over the pushed `prey-state` and
 * `hunting-tasks-state` projections, plus a balance footer (gold, wildcards,
 * task points). Every control only sends an intent; prices, rolls, and
 * balances are computed and re-validated server-side.
 */
export function PreyHuntingModal({
  tab,
  onTabChange,
  prey,
  preyPending,
  preyError,
  onPreyAction,
  tasks,
  tasksPending,
  tasksError,
  onTaskAction,
  gold,
  onClose,
}: PreyHuntingModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const preyListSlot =
    prey?.slots.find((slot) => slot.state === "list-selection") ?? null;
  const taskListSlot =
    tasks?.slots.find((slot) => slot.state === "list-selection") ?? null;

  const balance = (
    label: string,
    value: string,
    icon: "gold" | "wildcard" | null,
  ) => (
    <span
      title={label}
      aria-label={`${label}: ${value}`}
      className="flex h-9 min-w-28 items-center justify-end gap-1.5 rounded-sm border border-black/80 bg-black/60 px-2.5 text-sm"
    >
      <span className="font-bold tabular-nums text-ui-text-bright">
        {value}
      </span>
      {icon === "gold" && (
        <PixelImage
          src="ui/prey/prey_gold.png"
          sheetWidth={9}
          sheetHeight={9}
          scale={1.5}
        />
      )}
      {icon === "wildcard" && (
        <PixelImage
          src="ui/prey/prey_wildcard.png"
          sheetWidth={12}
          sheetHeight={12}
          scale={1.5}
        />
      )}
      {icon === null && (
        <span className="text-xs tracking-wide text-ui-muted uppercase">
          {label}
        </span>
      )}
    </span>
  );

  return (
    <Modal
      size="extra-wide"
      title={t("prey.title")}
      onClose={onClose}
      tabs={{
        label: t("preyHunting.tabsLabel"),
        selected: tab,
        items: [
          {
            id: "prey",
            label: t("prey.tab"),
            icon: (
              <PixelImage
                src="ui/prey/prey_inactive.png"
                sheetWidth={18}
                sheetHeight={18}
                scale={1.5}
              />
            ),
          },
          {
            id: "hunting-tasks",
            label: t("huntingTasks.tab"),
            icon: (
              <PixelImage
                src="ui/prey/prey_choose.png"
                sheetWidth={46}
                sheetHeight={73}
                x={1}
                y={0}
                width={44}
                height={35}
                scale={0.75}
              />
            ),
          },
        ],
        onSelect: (id) => onTabChange(id as PreyHuntingTab),
      }}
      footer={
        <div className="mr-auto flex flex-wrap items-center gap-2">
          {balance(
            t("preyHunting.goldLabel"),
            gold.toLocaleString(language),
            "gold",
          )}
          {balance(
            t("prey.wildcardsLabel"),
            (prey?.wildcards ?? 0).toLocaleString(language),
            "wildcard",
          )}
          {balance(
            t("huntingTasks.pointsLabel"),
            (tasks?.taskPoints ?? 0).toLocaleString(language),
            null,
          )}
        </div>
      }
    >
      {tab === "prey" ? (
        !prey ? (
          <p role="status" className="text-sm text-ui-muted">
            {t("prey.loading")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap justify-center gap-3">
              {prey.slots.map((slot) => (
                <PreySlotCard
                  key={slot.slot}
                  slot={slot}
                  wildcards={prey.wildcards}
                  listRerollPriceGold={prey.listRerollPriceGold}
                  pending={preyPending}
                  onAction={(action, extras) =>
                    onPreyAction(action, slot.slot, extras)
                  }
                />
              ))}
            </div>
            {preyListSlot && prey.listSelectionPool && (
              <PreyFullListPanel
                pool={prey.listSelectionPool}
                slot={preyListSlot.slot}
                pending={preyPending}
                onSelect={(raceId) =>
                  onPreyAction("wildcard-select", preyListSlot.slot, {
                    raceId,
                  })
                }
              />
            )}
            {preyError && (
              <p role="alert" className="text-sm text-red-300">
                {preyError}
              </p>
            )}
          </div>
        )
      ) : !tasks ? (
        <p role="status" className="text-sm text-ui-muted">
          {t("huntingTasks.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap justify-center gap-3">
            {tasks.slots.map((slot) => (
              <HuntingTaskSlotCard
                key={slot.slot}
                slot={slot}
                rerollPriceGold={tasks.rerollPriceGold}
                pending={tasksPending}
                onAction={(action, extras) =>
                  onTaskAction(action, slot.slot, extras)
                }
              />
            ))}
          </div>
          {taskListSlot && tasks.listSelectionPool && (
            <HuntingTaskFullListPanel
              pool={tasks.listSelectionPool}
              slot={taskListSlot.slot}
              slotRarity={taskListSlot.rarity}
              pending={tasksPending}
              onSelect={(raceId, upgrade) =>
                onTaskAction("select-monster", taskListSlot.slot, {
                  raceId,
                  upgrade,
                })
              }
            />
          )}
          {tasksError && (
            <p role="alert" className="text-sm text-red-300">
              {tasksError}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
