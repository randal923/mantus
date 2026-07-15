interface WeightIconProps {
  className?: string;
}

/** Small gray weight glyph used for the capacity label. */
export function WeightIcon({ className }: WeightIconProps) {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
    >
      <g transform="scale(0.21875)">
        <path
          d="M22 22v-5c0-5.523 4.477-10 10-10s10 4.477 10 10v5"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M15.5 21h33c1.6 0 3 1.1 3.35 2.65L59 55.2c.45 2-1.05 3.8-3.1 3.8H8.1c-2.05 0-3.55-1.8-3.1-3.8l7.15-31.55C12.5 22.1 13.9 21 15.5 21"
          fill="currentColor"
        />
        <path
          d="M32 21h16.5c1.6 0 3 1.1 3.35 2.65L59 55.2c.45 2-1.05 3.8-3.1 3.8H32z"
          fill="currentColor"
          opacity="0.72"
        />
      </g>
    </svg>
  );
}
