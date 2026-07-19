interface BrazilFlagProps {
  className?: string;
}

export function BrazilFlag({ className }: BrazilFlagProps) {
  return (
    <svg viewBox="0 0 24 16" aria-hidden className={className}>
      <rect width="24" height="16" fill="#009c3b" />
      <path d="M12 1.8 21.8 8 12 14.2 2.2 8Z" fill="#ffdf00" />
      <circle cx="12" cy="8" r="3.4" fill="#002776" />
      <path
        d="M8.9 7.3c2.1-.5 4.3 0 6.1 1.3"
        stroke="#f5f0e6"
        strokeWidth="0.7"
        fill="none"
      />
    </svg>
  );
}
