"use client";

import { PublicSiteArtworkHeader } from "../public-site/PublicSiteArtworkHeader";
import { PublicSiteShell } from "../public-site/PublicSiteShell";
import { LandingBanner } from "./LandingBanner";
import { LandingFeaturedArticle } from "./LandingFeaturedArticle";
import { LandingNavigation } from "./LandingNavigation";
import { LandingNewsTicker } from "./LandingNewsTicker";
import { LandingWorldSidebar } from "./LandingWorldSidebar";

export function LandingPage() {
  return (
    <PublicSiteShell>
      <PublicSiteArtworkHeader />
      <LandingBanner />
      <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-5 px-4 pb-10 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_17.5rem]">
        <LandingNavigation />
        <div className="order-1 flex min-w-0 flex-col gap-5 md:order-2">
          <LandingNewsTicker />
          <LandingFeaturedArticle />
        </div>
        <LandingWorldSidebar />
      </main>
    </PublicSiteShell>
  );
}
