interface UsaFlagProps {
  className?: string;
}

export function UsaFlag({ className }: UsaFlagProps) {
  return (
    <svg viewBox="0 0 24 16" aria-hidden className={className}>
      <rect width="24" height="16" fill="#b22234" />
      <path
        stroke="#f5f0e6"
        strokeWidth="1.23"
        d="M0 2.46h24M0 4.92h24M0 7.38h24M0 9.85h24M0 12.31h24M0 14.77h24"
      />
      <rect width="10" height="8.6" fill="#3c3b6e" />
      <g fill="#f5f0e6">
        <circle cx="2" cy="2.2" r="0.55" />
        <circle cx="5" cy="2.2" r="0.55" />
        <circle cx="8" cy="2.2" r="0.55" />
        <circle cx="3.5" cy="4.3" r="0.55" />
        <circle cx="6.5" cy="4.3" r="0.55" />
        <circle cx="2" cy="6.4" r="0.55" />
        <circle cx="5" cy="6.4" r="0.55" />
        <circle cx="8" cy="6.4" r="0.55" />
      </g>
    </svg>
  );
}
