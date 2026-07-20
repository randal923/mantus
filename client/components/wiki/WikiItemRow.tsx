"use client";

import type { WikiItem } from "../../lib/wiki/WikiItem";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface WikiItemRowProps {
  item: WikiItem;
  fallbackType: string;
  onSelect: (item: WikiItem) => void;
}

export function WikiItemRow({
  item,
  fallbackType,
  onSelect,
}: WikiItemRowProps) {
  const summary = [
    item.attack !== undefined ? `ATK ${item.attack}` : null,
    item.defense !== undefined ? `DEF ${item.defense}` : null,
    item.armor !== undefined ? `ARM ${item.armor}` : null,
    item.range !== undefined ? `RANGE ${item.range}` : null,
  ]
    .filter((value) => value !== null)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="ui-panel-inset group flex w-full items-center gap-4 rounded-sm border border-ui-stone-light/15 px-3 py-2 text-left transition-colors hover:border-ui-gold/55 focus-visible:border-ui-gold/70 focus-visible:outline-none"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-ui-stone-light/20 bg-black/35 shadow-inner">
        <SpriteIcon spriteId={item.spriteId} scale={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-bold tracking-wide text-ui-text-bright capitalize group-hover:text-ui-gold">
          {item.name}
        </span>
        <span className="mt-0.5 block truncate text-[10px] tracking-widest text-ui-muted uppercase">
          {item.primaryType ?? fallbackType}
        </span>
      </span>
      {summary && (
        <span className="hidden shrink-0 text-[10px] tracking-wide text-ui-muted lg:block">
          {summary}
        </span>
      )}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="size-4 shrink-0 text-ui-stone-light transition-transform group-hover:translate-x-0.5 group-hover:text-ui-gold"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m7 4 6 6-6 6" />
      </svg>
    </button>
  );
}
