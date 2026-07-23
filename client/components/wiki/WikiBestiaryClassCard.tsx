"use client";

import type { BestiaryClass, BestiaryCreatureEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BestiaryClassIcon } from "../bestiary/BestiaryClassIcon";

interface WikiBestiaryClassCardProps {
  className: BestiaryClass;
  entries: ReadonlyArray<BestiaryCreatureEntry>;
  onSelect: (className: BestiaryClass) => void;
}

export function WikiBestiaryClassCard({
  className,
  entries,
  onSelect,
}: WikiBestiaryClassCardProps) {
  const { t } = useAppTranslation();
  const completed = entries.filter((entry) => entry.stage === 4).length;

  return (
    <button
      type="button"
      onClick={() => onSelect(className)}
      className="ui-panel-inset group flex min-h-40 w-full flex-col overflow-hidden rounded-sm border border-ui-stone-light/15 text-center transition-colors hover:border-ui-gold/55 focus-visible:border-ui-gold/70 focus-visible:outline-none"
    >
      <span className="border-b border-ui-stone-light/10 bg-ui-panel-light/40 px-2 py-2 font-display text-xs font-bold tracking-wide text-ui-text capitalize group-hover:text-ui-gold">
        {className}
      </span>
      <span className="flex h-24 items-center justify-center">
        <BestiaryClassIcon bestiaryClass={className} />
      </span>
      <span className="mt-auto pb-3 text-xs tracking-widest text-ui-muted uppercase">
        {t("bestiary.completedOfTotal", {
          completed,
          total: entries.length,
        })}
      </span>
    </button>
  );
}
