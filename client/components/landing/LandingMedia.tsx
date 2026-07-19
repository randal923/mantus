"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { LandingImage } from "./LandingImage";
import { LandingSectionHeading } from "./LandingSectionHeading";

const SCREENSHOTS = ["combat", "city", "housing"] as const;

export function LandingMedia() {
  const { t } = useAppTranslation();

  return (
    <section
      id="media"
      className="mx-auto flex w-full max-w-6xl scroll-mt-28 flex-col gap-10 px-4 py-16 sm:px-6"
    >
      <LandingSectionHeading
        title={t("landing.media.title")}
        subtitle={t("landing.media.subtitle")}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {SCREENSHOTS.map((screenshot) => (
          <LandingImage
            key={screenshot}
            src={`/images/landing/screenshot-${screenshot}.webp`}
            alt={t(`landing.media.screenshots.${screenshot}`)}
            placeholderLabel={t(`landing.media.screenshots.${screenshot}`)}
            className="aspect-video w-full"
          />
        ))}
      </div>
    </section>
  );
}
