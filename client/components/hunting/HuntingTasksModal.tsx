"use client";

import type {
  TaskHuntingActionMessage,
  TaskHuntingStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { HuntingTaskFullListPanel } from "./HuntingTaskFullListPanel";
import {
  HuntingTaskSlotCard,
  type HuntingTaskSlotActionExtras,
} from "./HuntingTaskSlotCard";

interface HuntingTasksModalProps {
  /** Latest pushed projection; null only until the login push arrives. */
  tasks: TaskHuntingStateMessage | null;
  pending: boolean;
  /** Already-translated failure reason, if any. */
  error: string | null;
  onAction: (
    action: TaskHuntingActionMessage["action"],
    slot: number,
    extras?: HuntingTaskSlotActionExtras,
  ) => void;
  onClose: () => void;
}

/**
 * The hunting-tasks window over the pushed `hunting-tasks-state`
 * projection. Every control only sends an intent with a slot plus
 * raceId/upgrade; goals, rewards, and exhausts are server-enforced.
 */
export function HuntingTasksModal({
  tasks,
  pending,
  error,
  onAction,
  onClose,
}: HuntingTasksModalProps) {
  const { t } = useAppTranslation();
  const listSlot =
    tasks?.slots.find((slot) => slot.state === "list-selection") ?? null;

  return (
    <Modal
      size="extra-wide"
      title={t("huntingTasks.title")}
      onClose={onClose}
    >
      {!tasks ? (
        <p role="status" className="text-sm text-ui-muted">
          {t("huntingTasks.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
            <span className="rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
              {t("huntingTasks.pointsLabel")}: {tasks.taskPoints}
            </span>
            <span className="text-sm tabular-nums text-ui-muted">
              {t("huntingTasks.rerollPriceLabel")}:{" "}
              {t("huntingTasks.cost.gold", { gold: tasks.rerollPriceGold })}
            </span>
          </header>
          <div className="grid gap-4 lg:grid-cols-3">
            {tasks.slots.map((slot) => (
              <HuntingTaskSlotCard
                key={slot.slot}
                slot={slot}
                rerollPriceGold={tasks.rerollPriceGold}
                pending={pending}
                onAction={(action, extras) =>
                  onAction(action, slot.slot, extras)
                }
              />
            ))}
          </div>
          {listSlot && tasks.listSelectionPool && (
            <HuntingTaskFullListPanel
              pool={tasks.listSelectionPool}
              slot={listSlot.slot}
              slotRarity={listSlot.rarity}
              pending={pending}
              onSelect={(raceId, upgrade) =>
                onAction("select-monster", listSlot.slot, {
                  raceId,
                  upgrade,
                })
              }
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
