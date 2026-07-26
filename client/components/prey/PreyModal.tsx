"use client";

import type { PreyActionMessage, PreyStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { PreyFullListPanel } from "./PreyFullListPanel";
import { PreySlotCard, type PreySlotActionExtras } from "./PreySlotCard";

interface PreyModalProps {
  /** Latest pushed projection; null only until the login push arrives. */
  prey: PreyStateMessage | null;
  pending: boolean;
  /** Already-translated failure reason, if any. */
  error: string | null;
  onAction: (
    action: PreyActionMessage["action"],
    slot: number,
    extras?: PreySlotActionExtras,
  ) => void;
  onClose: () => void;
}

/**
 * The prey window over the pushed `prey-state` projection. Every control
 * only sends an intent with a slot plus index/raceId/option; prices, rolls,
 * and balances are computed and re-validated server-side.
 */
export function PreyModal({
  prey,
  pending,
  error,
  onAction,
  onClose,
}: PreyModalProps) {
  const { t } = useAppTranslation();
  const listSlot =
    prey?.slots.find((slot) => slot.state === "list-selection") ?? null;

  return (
    <Modal size="extra-wide" title={t("prey.title")} onClose={onClose}>
      {!prey ? (
        <p role="status" className="text-sm text-ui-muted">
          {t("prey.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
            <span className="rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
              {t("prey.wildcardsLabel")}: {prey.wildcards}
            </span>
            <span className="text-sm tabular-nums text-ui-muted">
              {t("prey.listRerollPriceLabel")}:{" "}
              {t("prey.cost.gold", { gold: prey.listRerollPriceGold })}
            </span>
          </header>
          <div className="grid gap-4 lg:grid-cols-3">
            {prey.slots.map((slot) => (
              <PreySlotCard
                key={slot.slot}
                slot={slot}
                wildcards={prey.wildcards}
                listRerollPriceGold={prey.listRerollPriceGold}
                pending={pending}
                onAction={(action, extras) =>
                  onAction(action, slot.slot, extras)
                }
              />
            ))}
          </div>
          {listSlot && prey.listSelectionPool && (
            <PreyFullListPanel
              pool={prey.listSelectionPool}
              slot={listSlot.slot}
              pending={pending}
              onSelect={(raceId) =>
                onAction("wildcard-select", listSlot.slot, { raceId })
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
