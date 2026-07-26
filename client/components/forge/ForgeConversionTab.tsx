"use client";

import {
  FORGE_RULES,
  type ForgeConversionMessage,
  type ForgeStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface ForgeConversionTabProps {
  forge: ForgeStateMessage;
  pending: boolean;
  onConversion: (conversion: ForgeConversionMessage["conversion"]) => void;
}

/** The three forge conversions with their protocol-table costs. */
export function ForgeConversionTab({
  forge,
  pending,
  onConversion,
}: ForgeConversionTabProps) {
  const { t } = useAppTranslation();
  const sliverDustCost =
    FORGE_RULES.dustPerSliver * FORGE_RULES.sliversPerConversion;
  const dustLimitCost = forge.dustLimit - FORGE_RULES.dustLimitCostOffset;
  const atMaxDustLimit = forge.dustLimit >= FORGE_RULES.maxDustLimit;
  const conversions = [
    {
      conversion: "dust-to-slivers" as const,
      title: t("forge.conversion.dustToSlivers", {
        dust: sliverDustCost,
        slivers: FORGE_RULES.sliversPerConversion,
      }),
      detail: t("forge.conversion.dustToSliversDetail"),
      disabled: forge.dusts < sliverDustCost,
    },
    {
      conversion: "slivers-to-cores" as const,
      title: t("forge.conversion.sliversToCores", {
        slivers: FORGE_RULES.sliverCoreCost,
      }),
      detail: t("forge.conversion.sliversToCoresDetail"),
      disabled: forge.slivers < FORGE_RULES.sliverCoreCost,
    },
    {
      conversion: "increase-dust-limit" as const,
      title: atMaxDustLimit
        ? t("forge.conversion.dustLimitMaxed", {
            limit: FORGE_RULES.maxDustLimit,
          })
        : t("forge.conversion.increaseDustLimit", {
            dust: dustLimitCost,
            limit: forge.dustLimit + 1,
          }),
      detail: t("forge.conversion.increaseDustLimitDetail"),
      disabled: atMaxDustLimit || forge.dusts < dustLimitCost,
    },
  ];

  return (
    <ul className="flex flex-col gap-3">
      {conversions.map((entry) => (
        <li
          key={entry.conversion}
          className="flex flex-wrap items-center gap-3 rounded-sm border border-ui-stone-light/15 bg-black/25 px-4 py-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ui-text-bright">
              {entry.title}
            </span>
            <span className="block text-xs text-ui-muted">{entry.detail}</span>
          </span>
          <Button
            size="sm"
            variant="primary"
            disabled={pending || entry.disabled}
            onClick={() => onConversion(entry.conversion)}
          >
            {t("forge.conversion.submit")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
