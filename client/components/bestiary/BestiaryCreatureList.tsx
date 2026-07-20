"use client";

import { useMemo, useState } from "react";
import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BestiaryCreatureCell } from "./BestiaryCreatureCell";

interface BestiaryCreatureListProps {
  entries: ReadonlyArray<BestiaryCreatureEntry>;
  onSelect: (raceId: number) => void;
}

/**
 * The whole bestiary in one scrollable list: non-clickable class headers
 * with dividers, creature cells beneath, and a name search. Locked entries
 * are excluded from search results — their names are still secret.
 */
export function BestiaryCreatureList({
  entries,
  onSelect,
}: BestiaryCreatureListProps) {
  const { t } = useAppTranslation();
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matching = normalized
      ? entries.filter(
          (entry) =>
            entry.stage > 0 && entry.name.toLowerCase().includes(normalized),
        )
      : entries;
    const grouped = new Map<string, BestiaryCreatureEntry[]>();
    for (const entry of matching) {
      const section = grouped.get(entry.className) ?? [];
      section.push(entry);
      grouped.set(entry.className, section);
    }
    return [...grouped.entries()].map(([className, creatures]) => ({
      className,
      creatures,
      total: entries.filter((entry) => entry.className === className).length,
      known: entries.filter(
        (entry) => entry.className === className && entry.stage > 0,
      ).length,
    }));
  }, [entries, query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("bestiary.searchPlaceholder")}
        aria-label={t("bestiary.searchPlaceholder")}
        className="mb-4 w-full rounded-sm border border-ui-stone-light/25 bg-black/40 px-3 py-1.5 text-sm text-ui-text-bright placeholder:text-ui-muted focus:border-ui-gold/60 focus:outline-hidden sm:w-72"
      />
      {sections.map((section) => (
        <section key={section.className} className="mb-5">
          <div className="mb-2 flex items-baseline gap-3">
            <h3 className="text-sm tracking-widest text-ui-gold uppercase">
              {section.className}
            </h3>
            <span className="text-xs text-ui-muted">
              {t("bestiary.knownOfTotal", {
                known: section.known,
                total: section.total,
              })}
            </span>
            <span
              aria-hidden
              className="h-px min-w-0 flex-1 self-center bg-linear-to-r from-ui-stone-light/30 to-transparent"
            />
          </div>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {section.creatures.map((entry) => (
              <li key={entry.raceId}>
                <BestiaryCreatureCell entry={entry} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {sections.length === 0 && (
        <p className="py-6 text-center text-xs text-ui-muted">
          {t("bestiary.noResults")}
        </p>
      )}
    </div>
  );
}
