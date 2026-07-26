"use client";

import { useState } from "react";
import type { PreyStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PreyCreatureSprite } from "./PreyCreatureSprite";

type PreyPoolEntry = NonNullable<
  PreyStateMessage["listSelectionPool"]
>[number];

interface PreyFullListPanelProps {
  pool: ReadonlyArray<PreyPoolEntry>;
  /** Zero-based slot currently in list-selection. */
  slot: number;
  pending: boolean;
  onSelect: (raceId: number) => void;
}

/**
 * Searchable full monster list shown while a slot is in list-selection.
 * Picking an entry only sends the race id; the server validates it against
 * its own pool.
 */
export function PreyFullListPanel({
  pool,
  slot,
  pending,
  onSelect,
}: PreyFullListPanelProps) {
  const { t } = useAppTranslation();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? pool.filter((entry) => entry.name.toLowerCase().includes(needle))
    : pool;

  return (
    <section
      aria-label={t("prey.fullList.title")}
      className="flex flex-col gap-3 rounded-xl border border-ui-gold/15 bg-black/20 p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-wide text-ui-text-bright">
          {t("prey.fullList.title")}
        </h3>
        <span className="text-xs tracking-wide text-ui-muted uppercase">
          {t("prey.fullList.slot", { slot: slot + 1 })}
        </span>
      </header>
      <Input
        label={t("prey.fullList.searchLabel")}
        placeholder={t("prey.fullList.searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length === 0 ? (
        <p className="text-sm text-ui-muted">{t("prey.fullList.empty")}</p>
      ) : (
        <ul className="ui-scrollbar flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {matches.map((entry) => (
            <li
              key={entry.raceId}
              className="flex items-center gap-3 rounded-lg border border-ui-stone-light/15 bg-black/25 px-2 py-1.5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center">
                <PreyCreatureSprite lookTypeId={entry.lookTypeId} fit={32} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ui-text/85">
                {entry.name}
              </span>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => onSelect(entry.raceId)}
              >
                {t("prey.fullList.select")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
