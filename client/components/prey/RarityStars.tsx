interface RarityStarsProps {
  value: number;
  max: number;
  /** Translated accessible name, e.g. "Rarity 7 of 10". */
  label: string;
  className?: string;
}

/** Filled/empty star row for prey bonus rarity and task star ratings. */
export function RarityStars({ value, max, label, className }: RarityStarsProps) {
  const filled = Math.max(0, Math.min(value, max));
  return (
    <span
      role="img"
      aria-label={label}
      className={`text-xs leading-none tracking-tight text-ui-gold ${className ?? ""}`}
    >
      {"★".repeat(filled)}
      <span aria-hidden className="text-ui-muted/50">
        {"☆".repeat(Math.max(0, max - filled))}
      </span>
    </span>
  );
}
