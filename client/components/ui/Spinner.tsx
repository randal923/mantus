import { useId } from "react";

interface SpinnerProps {
  className?: string;
  /** Announces the spinner to assistive tech; omit when adjacent text already says what is loading. */
  label?: string;
}

/**
 * Forged-iron loading spinner: a sunken track, a bright arc with a fading tail
 * and an ember at its head, and a slow counter-rotating inner rune ring. Draws
 * in `currentColor`, so it takes on the text colour of whatever contains it.
 */
export function Spinner({ className, label }: SpinnerProps) {
  const id = useId();
  const tailId = `${id}-tail`;
  const glowId = `${id}-glow`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className ?? "size-4"}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient
          id={tailId}
          gradientUnits="userSpaceOnUse"
          x1="12"
          y1="3"
          x2="12"
          y2="21"
        >
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0.45" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="2"
      />
      <g className="origin-center motion-safe:animate-[spin_0.9s_linear_infinite]">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={`url(#${tailId})`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="40 56.55"
          transform="rotate(-90 12 12)"
        />
        <circle
          cx="12"
          cy="3"
          r="2.2"
          fill="currentColor"
          fillOpacity="0.55"
          filter={`url(#${glowId})`}
        />
        <circle cx="12" cy="3" r="1.35" fill="currentColor" />
      </g>
      <g
        className="origin-center motion-safe:animate-[spin_2.6s_linear_infinite_reverse]"
        fill="currentColor"
        fillOpacity="0.55"
      >
        <rect x="11.35" y="6.6" width="1.3" height="1.9" rx="0.4" />
        <rect x="11.35" y="15.5" width="1.3" height="1.9" rx="0.4" />
        <rect x="6.6" y="11.35" width="1.9" height="1.3" rx="0.4" />
        <rect x="15.5" y="11.35" width="1.9" height="1.3" rx="0.4" />
      </g>
    </svg>
  );
}
