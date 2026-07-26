"use client";

import { useMemo, useState } from "react";
import {
  FORGE_RULES,
  type ForgeConversionMessage,
  type ForgeFusionMessage,
  type ForgeHistoryStateMessage,
  type ForgeResultMessage,
  type ForgeStateMessage,
  type ForgeTransferMessage,
  type InventoryState,
} from "@tibia/protocol";
import { useWikiItems } from "../../hooks/useWikiItems";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { ForgeConversionTab } from "./ForgeConversionTab";
import { ForgeFusionTab } from "./ForgeFusionTab";
import { ForgeHistoryTab } from "./ForgeHistoryTab";
import { ForgeResourceBar } from "./ForgeResourceBar";
import { ForgeResultBanner } from "./ForgeResultBanner";
import { ForgeTransferTab } from "./ForgeTransferTab";

type ForgeTab = "fusion" | "transfer" | "conversion" | "history";

const FORGE_TABS: ReadonlyArray<ForgeTab> = [
  "fusion",
  "transfer",
  "conversion",
  "history",
];

interface ForgeModalProps {
  forge: ForgeStateMessage | null;
  history: ForgeHistoryStateMessage | null;
  result: ForgeResultMessage | null;
  inventory: InventoryState;
  pending: boolean;
  error: string | null;
  onFusion: (intent: Omit<ForgeFusionMessage, "type">) => void;
  onTransfer: (intent: Omit<ForgeTransferMessage, "type">) => void;
  onConversion: (conversion: ForgeConversionMessage["conversion"]) => void;
  onRequestHistory: (page: number) => void;
  onDismissResult: () => void;
  onClose: () => void;
}

/**
 * Exaltation Forge window. Every action only sends an intent with item ids
 * and toggles; the server owns rolls, balances, and item mutations.
 */
export function ForgeModal({
  forge,
  history,
  result,
  inventory,
  pending,
  error,
  onFusion,
  onTransfer,
  onConversion,
  onRequestHistory,
  onDismissResult,
  onClose,
}: ForgeModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<ForgeTab>("fusion");
  const wikiItems = useWikiItems();
  const itemsById = useMemo(
    () => new Map(wikiItems.items.map((item) => [item.id, item])),
    [wikiItems.items],
  );
  const resultItem = result ? itemsById.get(result.itemTypeId) : undefined;
  const selectTab = (next: ForgeTab) => {
    setTab(next);
    if (next === "history" && !history) onRequestHistory(0);
  };

  return (
    <Modal
      title={t("forge.title")}
      size="wide"
      onClose={onClose}
      tabs={{
        label: t("forge.sections"),
        selected: tab,
        items: FORGE_TABS.map((id) => ({
          id,
          label: t(`forge.tabs.${id}`),
        })),
        onSelect: (id) => selectTab(id as ForgeTab),
      }}
      pagination={
        tab === "history" && history && history.totalPages > 1
          ? {
              currentPage: history.page + 1,
              totalPages: history.totalPages,
              disabled: pending,
              onPrevious: () => onRequestHistory(history.page - 1),
              onNext: () => onRequestHistory(history.page + 1),
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {forge ? (
          <ForgeResourceBar
            forge={forge}
            sliverSpriteId={
              itemsById.get(FORGE_RULES.sliverItemTypeId)?.spriteId
            }
            coreSpriteId={itemsById.get(FORGE_RULES.coreItemTypeId)?.spriteId}
          />
        ) : (
          <p className="py-2 text-center text-sm text-ui-muted">
            {t("forge.loading")}
          </p>
        )}

        {result && (
          <ForgeResultBanner
            result={result}
            itemName={resultItem?.name}
            itemSpriteId={resultItem?.spriteId}
            onDismiss={onDismissResult}
          />
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-sm text-ui-accent-light"
          >
            {error}
          </p>
        )}

        {tab === "fusion" && (
          <ForgeFusionTab
            inventory={inventory}
            pending={pending}
            onFusion={onFusion}
          />
        )}
        {tab === "transfer" && (
          <ForgeTransferTab
            inventory={inventory}
            pending={pending}
            onTransfer={onTransfer}
          />
        )}
        {tab === "conversion" && forge && (
          <ForgeConversionTab
            forge={forge}
            pending={pending}
            onConversion={onConversion}
          />
        )}
        {tab === "history" && <ForgeHistoryTab history={history} />}
      </div>
    </Modal>
  );
}
