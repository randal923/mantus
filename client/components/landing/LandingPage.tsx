"use client";

import { useLanguageInitialization } from "../../i18n/useLanguageInitialization";
import { LandingCallToAction } from "./LandingCallToAction";
import { LandingFeatures } from "./LandingFeatures";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { LandingMedia } from "./LandingMedia";
import { LandingNews } from "./LandingNews";
import { LandingVocations } from "./LandingVocations";

export function LandingPage() {
  useLanguageInitialization();

  return (
    <div id="top" className="ui-backdrop relative isolate min-h-screen w-full scroll-smooth font-tibia">
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035]"
      />
      <LandingHeader />
      <main>
        <LandingHero />
        <div aria-hidden className="ui-divider mx-auto w-full max-w-4xl" />
        <LandingNews />
        <LandingFeatures />
        <LandingVocations />
        <LandingMedia />
        <LandingCallToAction />
      </main>
      <LandingFooter />
    </div>
  );
}
