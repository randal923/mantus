"use client";

import { useMemo } from "react";
import type { ImbuementOption } from "@tibia/protocol";
import { formatImbuementDuration } from "../../lib/imbuement/formatImbuementDuration";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ImbuementOptionRow } from "./ImbuementOptionRow";
import { ImbuementPanel } from "./ImbuementPanel";
import { ImbuementTierTabs } from "./ImbuementTierTabs";

interface ImbuementListPanelProps {
  options: ReadonlyArray<ImbuementOption>;
  tier: number;
  onSelectTier: (baseId: number) => void;
  selectedImbuementId: number | null;
  onSelectImbuement: (imbuementId: number) => void;
  durationSeconds: number;
}

/**
 * Tibia's "Select Quality and Imbuement" panel: the three tier buttons over
 * the list for that tier, with the highlighted imbuement's description below.
 */
export function ImbuementListPanel({
  options,
  tier,
  onSelectTier,
  selectedImbuementId,
  onSelectImbuement,
  durationSeconds,
}: ImbuementListPanelProps) {
  const { t } = useAppTranslation();
  const tiers = useMemo(() => {
    const byBaseId = new Map<number, { baseName: string; enabled: boolean }>();
    for (const option of options) {
      const existing = byBaseId.get(option.baseId);
      // A tier stays clickable unless the item cannot take it at all. Missing
      // materials grey the individual row, not the whole tier — otherwise the
      // player can never see which sources they are short of.
      byBaseId.set(option.baseId, {
        baseName: option.baseName,
        enabled:
          (existing?.enabled ?? false) ||
          option.blockedReason !== "wrong-category",
      });
    }
    return [...byBaseId.entries()]
      .map(([baseId, entry]) => ({ baseId, ...entry }))
      .sort((left, right) => left.baseId - right.baseId);
  }, [options]);
  const visible = useMemo(
    () => options.filter((option) => option.baseId === tier),
    [options, tier],
  );
  const selected =
    visible.find((option) => option.imbuementId === selectedImbuementId) ??
    null;

  return (
    <ImbuementPanel title={t("imbuement.selectQuality")}>
      <div className="flex flex-col gap-2">
        <ImbuementTierTabs
          tiers={tiers}
          selected={tier}
          onSelect={onSelectTier}
        />
        {visible.length === 0 ? (
          <p className="py-6 text-center text-base text-ui-muted">
            {t("imbuement.noOptions")}
          </p>
        ) : (
          <ul className="ui-scrollbar max-h-48 overflow-y-auto pr-1">
            {visible.map((option) => (
              <ImbuementOptionRow
                key={option.imbuementId}
                option={option}
                selected={option.imbuementId === selectedImbuementId}
                onSelect={() => onSelectImbuement(option.imbuementId)}
              />
            ))}
          </ul>
        )}
        <p className="ui-scrollbar min-h-8 max-h-12 shrink-0 overflow-y-auto border-t border-ui-stone-light/15 pt-2 text-sm text-ui-muted">
          {selected
            ? t("imbuement.effectAndDuration", {
                description: selected.description,
                duration: formatImbuementDuration(durationSeconds),
              })
            : t("imbuement.selectHint")}
        </p>
      </div>
    </ImbuementPanel>
  );
}
