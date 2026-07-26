"use client";

import type { ForgeResultMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ForgeResultBannerProps {
  result: ForgeResultMessage;
  /** Display data resolved from the wiki catalog, when available. */
  itemName?: string;
  itemSpriteId?: number;
  onDismiss: () => void;
}

/** Outcome of the last fusion/transfer as the server reported it. */
export function ForgeResultBanner({
  result,
  itemName,
  itemSpriteId,
  onDismiss,
}: ForgeResultBannerProps) {
  const { t } = useAppTranslation();

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
        result.success
          ? "border-green-500/35 bg-green-500/10 text-green-200"
          : "border-ui-accent/35 bg-ui-accent/10 text-ui-accent-light"
      }`}
    >
      {itemSpriteId !== undefined && (
        <SpriteIcon spriteId={itemSpriteId} scale={1} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block">
          {result.success
            ? t(`forge.result.${result.action}Success`, {
                name: itemName ?? t("forge.result.item"),
                tier: result.resultTier,
              })
            : t("forge.result.failure", {
                name: itemName ?? t("forge.result.item"),
              })}
        </span>
        {result.bonus > 0 && (
          <span className="block text-xs opacity-90">
            {t(`forge.bonus.${result.bonus}`)}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label={t("modal.close")}
        onClick={onDismiss}
        className="shrink-0 text-lg leading-none opacity-70 transition-opacity hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
