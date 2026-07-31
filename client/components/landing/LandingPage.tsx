"use client";

import { PublicSiteLayout } from "../public-site/PublicSiteLayout";
import { LandingNews } from "./LandingNews";

export function LandingPage() {
  return (
    <PublicSiteLayout>
      <LandingNews />
    </PublicSiteLayout>
  );
}
