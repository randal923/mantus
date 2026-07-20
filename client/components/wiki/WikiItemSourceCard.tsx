"use client";

import type { WikiItemSource } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "../bestiary/AnimatedOutfit";

interface WikiItemSourceCardProps {
  source: WikiItemSource;
  onSelect: (source: WikiItemSource) => void;
}

export function WikiItemSourceCard({
  source,
  onSelect,
}: WikiItemSourceCardProps) {
  const { t } = useAppTranslation();

  return (
    <button
      type="button"
      onClick={() => onSelect(source)}
      title={source.name}
      className="ui-panel-inset group flex min-h-32 flex-col items-center rounded-sm border border-ui-stone-light/20 p-2 text-center transition-colors hover:border-ui-gold/60 focus-visible:border-ui-gold focus-visible:outline-none"
    >
      <span className="flex h-20 items-center justify-center">
        <AnimatedOutfit outfit={source.outfit} fit={76} />
      </span>
      <span className="w-full truncate text-xs text-ui-text-bright capitalize group-hover:text-ui-gold">
        {source.name}
      </span>
      <span className="mt-0.5 text-[9px] tracking-widest text-ui-muted uppercase">
        {t(`wiki.items.source.${source.scope}`)}
      </span>
    </button>
  );
}
