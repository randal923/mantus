"use client";

interface ImbuementTierTabsProps {
  /** Base ids present in the window, ascending: 1 Basic, 2 Intricate, 3 Powerful. */
  tiers: ReadonlyArray<{ baseId: number; baseName: string; enabled: boolean }>;
  selected: number;
  onSelect: (baseId: number) => void;
}

/**
 * Tibia's Basic / Intricate / Powerful selector. Tiers the item cannot take
 * stay visible and disabled rather than disappearing, which is why the server
 * sends blocked options instead of filtering them out.
 */
export function ImbuementTierTabs({
  tiers,
  selected,
  onSelect,
}: ImbuementTierTabsProps) {
  return (
    <div role="tablist" aria-orientation="horizontal" className="flex gap-1.5">
      {tiers.map((tier) => (
        <button
          key={tier.baseId}
          type="button"
          role="tab"
          aria-selected={tier.baseId === selected}
          disabled={!tier.enabled}
          onClick={() => onSelect(tier.baseId)}
          className={`flex-1 rounded-sm border px-2 py-1.5 font-display text-sm font-bold tracking-widest uppercase transition-colors ${
            tier.baseId === selected
              ? "border-ui-gold/60 bg-ui-gold/10 text-ui-text-bright"
              : "border-ui-stone-light/15 bg-black/30 text-ui-muted hover:border-ui-stone-light/40"
          } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ui-stone-light/15`}
        >
          {tier.baseName}
        </button>
      ))}
    </div>
  );
}
