"use client";

import Link from "next/link";

interface LandingMenuLinkProps {
  readonly href: string;
  readonly label: string;
}

/** One link row inside a landing sidebar menu group. */
export function LandingMenuLink({ href, label }: LandingMenuLinkProps) {
  return (
    <Link
      href={href}
      className="group relative z-[2] flex min-h-9 items-center gap-2.5 px-4 text-sm text-ui-text transition-colors hover:bg-white/5 hover:text-ui-text-bright"
    >
      <span
        aria-hidden
        className="size-1.5 rotate-45 border border-ui-stone-light/70 bg-ui-stone-dark transition-colors group-hover:bg-ui-stone-light"
      />
      {label}
    </Link>
  );
}
