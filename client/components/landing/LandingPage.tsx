"use client";

import { PublicSiteArtworkHeader } from "../public-site/PublicSiteArtworkHeader";
import { PublicSiteShell } from "../public-site/PublicSiteShell";
import { LandingCommunityBand } from "./LandingCommunityBand";
import { LandingFeaturedArticle } from "./LandingFeaturedArticle";
import { LandingNavigation } from "./LandingNavigation";
import { LandingNewsTicker } from "./LandingNewsTicker";
import { LandingWorldSidebar } from "./LandingWorldSidebar";
import { useAppTranslation } from "../../i18n/useAppTranslation";

export function LandingPage() {
  const { t } = useAppTranslation();

  return (
    <PublicSiteShell>
      <PublicSiteArtworkHeader />
      <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-7 px-4 pt-8 pb-12 sm:px-6 md:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_18rem]">
        <LandingNavigation />
        <div className="order-1 flex min-w-0 flex-col gap-5 md:order-2">
          <h2 className="font-display text-lg font-semibold tracking-[0.14em] text-[#e8e3db] uppercase">
            {t("landing.menu.news.latest")}
          </h2>
          <LandingNewsTicker />
          <LandingFeaturedArticle />
          <LandingCommunityBand />
        </div>
        <LandingWorldSidebar />
      </main>
    </PublicSiteShell>
  );
}
