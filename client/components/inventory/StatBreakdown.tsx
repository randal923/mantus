"use client";

/** One labelled term of a stat's total, e.g. "Base 116" or "Equipment +26". */
export interface StatBreakdownTerm {
  readonly label: string;
  readonly value: string;
  /** Renders green/red; base terms stay neutral. */
  readonly signed?: boolean;
}

interface StatBreakdownProps {
  terms: ReadonlyArray<StatBreakdownTerm>;
  totalLabel: string;
  totalValue: string;
}

/**
 * The hover body shared by every stat that has a bonus: the terms that make up
 * the total on one line, then the total after a divider. Display only — the
 * server already applied every number here.
 */
export function StatBreakdown({
  terms,
  totalLabel,
  totalValue,
}: StatBreakdownProps) {
  return (
    <span className="flex min-w-40 flex-col gap-1 whitespace-nowrap">
      {terms.map((term) => (
        <span key={term.label} className="flex justify-between gap-6">
          <span className="text-ui-muted">{term.label}</span>
          <span
            className={`tabular-nums ${
              term.signed
                ? term.value.startsWith("-")
                  ? "text-red-400"
                  : "text-emerald-400"
                : ""
            }`}
          >
            {term.value}
          </span>
        </span>
      ))}
      <span className="mt-1 flex justify-between gap-6 border-t border-ui-gold/20 pt-1.5">
        <span className="text-ui-muted">{totalLabel}</span>
        <span className="font-semibold tabular-nums">{totalValue}</span>
      </span>
    </span>
  );
}
