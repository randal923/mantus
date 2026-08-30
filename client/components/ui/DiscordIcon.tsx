interface DiscordIconProps {
  readonly className?: string;
}

/** Chat-bubble icon used for Discord links on the public site. */
export function DiscordIcon({ className }: DiscordIconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.2-4.2A8 8 0 0 1 13 4a8 8 0 0 1 8 8z" />
      <circle cx="9.5" cy="12" r="1" />
      <circle cx="14.5" cy="12" r="1" />
    </svg>
  );
}
