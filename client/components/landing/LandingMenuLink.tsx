"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface LandingMenuLinkProps {
  readonly href: string;
  readonly label: string;
}

/** One link row inside a landing sidebar menu group. */
export function LandingMenuLink({ href, label }: LandingMenuLinkProps) {
  const pathname = usePathname();
  const base = href.split("#")[0] || "/";
  const active = pathname === base;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`portal-nav-link${active ? " portal-nav-link-active" : ""}`}
    >
      {label}
    </Link>
  );
}
