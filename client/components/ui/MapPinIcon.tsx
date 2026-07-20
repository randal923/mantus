interface MapPinIconProps {
  className?: string;
}

export function MapPinIcon({ className }: MapPinIconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#ff1a1a"
        stroke="#000000"
        strokeWidth="1.25"
        strokeLinejoin="round"
        d="M12 1.5A8.5 8.5 0 0 0 3.5 10c0 5.7 7.57 12.04 7.89 12.31a.95.95 0 0 0 1.22 0c.32-.27 7.89-6.61 7.89-12.31A8.5 8.5 0 0 0 12 1.5Zm0 4.25a4.25 4.25 0 1 0 0 8.5 4.25 4.25 0 0 0 0-8.5Z"
      />
    </svg>
  );
}
