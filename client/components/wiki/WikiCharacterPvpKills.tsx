"use client";

import {
  CYCLOPEDIA_LIMITS,
  type CyclopediaPvpKillsStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

interface WikiCharacterPvpKillsProps {
  pvpKills: CyclopediaPvpKillsStateMessage | null;
  pending: boolean;
}

/** Paged PvP kill log with the server's justified/unjustified verdicts. */
export function WikiCharacterPvpKills({
  pvpKills,
  pending,
}: WikiCharacterPvpKillsProps) {
  const { t } = useAppTranslation();
  if (!pvpKills) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {pending
          ? t("wiki.character.loading")
          : t("wiki.character.pvp.unavailable")}
      </p>
    );
  }
  if (pvpKills.entries.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ui-muted">
        {t("wiki.character.pvp.empty", {
          days: CYCLOPEDIA_LIMITS.pvpKillsWindowDays,
        })}
      </p>
    );
  }

  return (
    <ul aria-label={t("wiki.character.tabs.pvp")} className="space-y-2">
      {pvpKills.entries.map((entry, index) => (
        <li
          key={`${entry.at}-${index}`}
          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-md border border-ui-stone-light/15 bg-black/25 p-3"
        >
          <span className="shrink-0 text-xs tabular-nums text-ui-muted">
            {new Date(entry.at).toLocaleString()}
          </span>
          <span className="min-w-0 flex-1 text-sm text-ui-text/85">
            {entry.description}
          </span>
          <span
            className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-xs tracking-wide uppercase ${
              entry.status === "unjustified"
                ? "border-red-400/40 bg-red-950/40 text-red-300"
                : "border-ui-success/40 bg-black/25 text-ui-success"
            }`}
          >
            {t(`wiki.character.pvp.${entry.status}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}
