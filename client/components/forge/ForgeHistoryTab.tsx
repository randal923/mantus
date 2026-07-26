"use client";

import type { ForgeHistoryStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface ForgeHistoryTabProps {
  history: ForgeHistoryStateMessage | null;
}

/** Server-recorded forge log page (fetched via forge-history-get). */
export function ForgeHistoryTab({ history }: ForgeHistoryTabProps) {
  const { t } = useAppTranslation();
  if (!history) {
    return (
      <p className="py-8 text-center text-sm text-ui-muted">
        {t("forge.history.loading")}
      </p>
    );
  }
  if (history.entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ui-muted">
        {t("forge.history.empty")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.entries.map((entry, index) => (
        <li
          key={`${entry.at}:${index}`}
          className="rounded-sm border border-ui-stone-light/15 bg-black/25 px-3 py-2"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs tracking-widest text-ui-gold uppercase">
              {t(`forge.history.action.${entry.action}`)}
              {entry.convergence ? ` · ${t("forge.convergence")}` : ""}
            </span>
            <span
              className={`text-xs ${
                entry.success ? "text-green-400" : "text-red-300"
              }`}
            >
              {entry.success
                ? t("forge.history.success")
                : t("forge.history.failure")}
            </span>
            <span className="ml-auto text-xs text-ui-muted">
              {new Date(entry.at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-ui-text-bright">
            {entry.description}
          </p>
          <p className="mt-0.5 text-xs text-ui-muted">
            {t("forge.history.costs", {
              gold: entry.costGold.toLocaleString(),
              dust: entry.costDust,
              cores: entry.costCores,
            })}
            {entry.gained > 0
              ? ` · ${t("forge.history.gained", { count: entry.gained })}`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
