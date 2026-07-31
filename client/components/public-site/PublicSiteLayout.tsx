"use client";

import type { ReactNode } from "react";
import { LandingNavigation } from "../landing/LandingNavigation";
import { LandingWorldSidebar } from "../landing/LandingWorldSidebar";
import { PublicSiteArtworkHeader } from "./PublicSiteArtworkHeader";
import { PublicSiteShell } from "./PublicSiteShell";

interface PublicSiteLayoutProps {
  readonly children: ReactNode;
}

export function PublicSiteLayout({ children }: PublicSiteLayoutProps) {
  return (
    <PublicSiteShell>
      <PublicSiteArtworkHeader />
      <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-5 px-4 pt-8 pb-8 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_17.5rem]">
        <LandingNavigation />
        <div className="order-1 flex min-w-0 flex-col gap-5 md:order-2">
          {children}
        </div>
        <LandingWorldSidebar />
      </main>
    </PublicSiteShell>
  );
}
