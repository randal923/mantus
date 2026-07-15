interface DurabilityIconProps {
  className?: string;
}

/** Broken sword glyph for durability rows; inherits text color. */
export function DurabilityIcon({ className }: DurabilityIconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden
      className={className}
    >
      <g fill="currentColor">
        <path d="M4.12 10.32 7.52 6.92l1.18.33-.6.85.98.38-3.4 3.4z" />
        <path d="M9.52 4.92 14.8 1.2 11.08 6.48l-.98-.38.5-.8z" />
      </g>
      <g
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      >
        <path d="m3.2 9.6 3.2 3.2" />
        <path d="M4.8 11.2 2.5 13.5" />
      </g>
      <circle cx="2.1" cy="13.9" r="1.2" fill="currentColor" />
    </svg>
  );
}
