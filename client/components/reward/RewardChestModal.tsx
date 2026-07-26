"use client";

import type { RewardChestStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface RewardChestModalProps {
  state: RewardChestStateMessage;
  nowMs: number;
  error: string | null;
  onCollect: (bagId: string, itemId?: string) => void;
  onClose: () => void;
}

function remainingLabel(expiresAtMs: number, nowMs: number): string {
  const remaining = Math.max(0, expiresAtMs - nowMs);
  const days = Math.floor(remaining / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(remaining / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.floor(remaining / 60_000))}m`;
}

/**
 * The reward chest (Feature 84): one bag per boss kill, expiring after seven
 * days. Collect buttons only send intents — the server re-checks reach,
 * ownership, capacity and weight at execution time.
 */
export function RewardChestModal({
  state,
  nowMs,
  error,
  onCollect,
  onClose,
}: RewardChestModalProps) {
  const { t } = useAppTranslation();
  return (
    <Modal title={t("rewardChest.title")} onClose={onClose} size="wide">
      <div className="flex max-h-[26rem] min-h-0 flex-col gap-3">
        {error && (
          <p className="text-sm text-ui-accent-light">{error}</p>
        )}
        {state.bags.length === 0 ? (
          <p className="py-8 text-center text-sm text-ui-muted">
            {t("rewardChest.empty")}
          </p>
        ) : (
          <ul className="ui-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {state.bags.map((bag) => (
              <li
                key={bag.bagId}
                className="rounded-lg border border-ui-stone/25 bg-black/30 p-3"
              >
                <header className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ui-text-bright">
                      {bag.bossName}
                    </div>
                    <div className="text-xs text-ui-muted">
                      {t("rewardChest.expiresIn", {
                        remaining: remainingLabel(bag.expiresAtMs, nowMs),
                      })}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onCollect(bag.bagId)}>
                    {t("rewardChest.collectAll")}
                  </Button>
                </header>
                <ul className="space-y-1">
                  {bag.items.map((item) => (
                    <li
                      key={item.itemId}
                      className="flex items-center gap-3 rounded-md border border-ui-stone/20 bg-black/20 px-2 py-1"
                    >
                      <SpriteIcon spriteId={item.spriteId} scale={0.9} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ui-text">
                        {item.count > 1 ? `${item.count}× ` : ""}
                        {item.name}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onCollect(bag.bagId, item.itemId)}
                      >
                        {t("rewardChest.collect")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
