"use client";

import type { ReactNode } from "react";
import { useLanguageInitialization } from "../../i18n/useLanguageInitialization";
import { PublicSiteFooter } from "./PublicSiteFooter";
import { PublicSiteHeader } from "./PublicSiteHeader";

interface PublicSiteShellProps {
  readonly children: ReactNode;
}

export function PublicSiteShell({ children }: PublicSiteShellProps) {
  useLanguageInitialization();

  return (
    <div
      id="top"
      className="ui-backdrop relative isolate min-h-screen w-full scroll-smooth font-tibia"
    >
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035]"
      />
      <PublicSiteHeader />
      {children}
      <PublicSiteFooter />
    </div>
  );
}
