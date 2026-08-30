"use client";

import type { ReactNode } from "react";
import { useLanguageInitialization } from "../../i18n/useLanguageInitialization";
import { PublicSiteFooter } from "./PublicSiteFooter";
import { PublicSiteTopbar } from "./PublicSiteTopbar";

interface PublicSiteShellProps {
  readonly children: ReactNode;
}

export function PublicSiteShell({ children }: PublicSiteShellProps) {
  useLanguageInitialization();

  return (
    <div
      id="top"
      className="relative isolate min-h-screen w-full scroll-smooth bg-[#0a0a0a] font-tibia text-ui-text"
    >
      <PublicSiteTopbar />
      {children}
      <PublicSiteFooter />
    </div>
  );
}
