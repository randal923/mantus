"use client";

interface SlotActionButtonProps {
  label: string;
  /** Price plate rendered under the label, e.g. "66,200 gold" or "free". */
  cost?: string;
  /** Gold framing for the slot's main action (claim, unlock). */
  primary?: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
}

/**
 * Tibia-style slot action: a framed button with the action label on top and
 * its price on a darker plate underneath.
 */
export function SlotActionButton({
  label,
  cost,
  primary = false,
  disabled,
  title,
  onClick,
}: SlotActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-ui-gold/40 bg-ui-gold-deep/25 enabled:hover:border-ui-gold/70"
          : "border-ui-stone-light/20 bg-black/30 enabled:hover:border-ui-gold/40"
      }`}
    >
      <span
        className={`flex min-h-8 w-full flex-1 items-center justify-center px-1.5 py-1 text-xs leading-tight ${
          primary ? "text-ui-gold" : "text-ui-text/85"
        }`}
      >
        {label}
      </span>
      {cost !== undefined && (
        <span className="w-full border-t border-ui-stone-light/15 bg-black/45 px-1 py-0.5 text-[11px] tabular-nums text-ui-gold">
          {cost}
        </span>
      )}
    </button>
  );
}
