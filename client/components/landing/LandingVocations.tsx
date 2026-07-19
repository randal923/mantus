"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingSectionHeading } from "./LandingSectionHeading";
import { LandingVocationCard } from "./LandingVocationCard";
import { LANDING_VOCATION_SHOWCASE } from "./landingVocationShowcase";

export function LandingVocations() {
  const { t } = useAppTranslation();

  return (
    <section
      id="vocations"
      className="mx-auto flex w-full max-w-6xl scroll-mt-28 flex-col gap-10 px-4 py-16 sm:px-6"
    >
      <LandingSectionHeading
        title={t("landing.vocations.title")}
        subtitle={t("landing.vocations.subtitle")}
      />
      <div className="grid grid-cols-1 gap-4 pb-8 sm:grid-cols-3 lg:grid-cols-5">
        {LANDING_VOCATION_SHOWCASE.map((showcase, index) => (
          <LandingVocationCard
            key={showcase.vocation}
            showcase={showcase}
            className={index % 2 === 1 ? "lg:translate-y-8" : ""}
          />
        ))}
      </div>
    </section>
  );
}
