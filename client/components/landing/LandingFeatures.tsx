"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingFeatureCard } from "./LandingFeatureCard";
import { LandingSectionHeading } from "./LandingSectionHeading";

const FEATURES = ["world", "combat", "economy", "social"] as const;

export function LandingFeatures() {
  const { t } = useAppTranslation();

  return (
    <section
      id="features"
      className="mx-auto flex w-full max-w-6xl scroll-mt-28 flex-col gap-10 px-4 py-16 sm:px-6"
    >
      <LandingSectionHeading
        title={t("landing.features.title")}
        subtitle={t("landing.features.subtitle")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <LandingFeatureCard
            key={feature}
            title={t(`landing.features.${feature}.title`)}
            description={t(`landing.features.${feature}.description`)}
          />
        ))}
      </div>
    </section>
  );
}
