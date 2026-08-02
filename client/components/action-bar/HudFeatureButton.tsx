"use client";

interface HudFeatureButtonProps {
  label: string;
  title: string;
  enabled: boolean;
  onClick: () => void;
}

/** Shared status/configuration button displayed above the action bar. */
export function HudFeatureButton({
  label,
  title,
  enabled,
  onClick,
}: HudFeatureButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="ui-button ui-button-secondary flex h-9 items-center justify-center gap-2 rounded border border-ui-stone-light/25 px-3 text-xs font-bold text-ui-muted hover:border-ui-gold/55 hover:text-ui-gold"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${
          enabled
            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            : "bg-ui-stone"
        }`}
      />
      {label}
    </button>
  );
}
