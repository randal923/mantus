"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ButtonLink } from "../ui/ButtonLink";

export function LandingCallToAction() {
  const { t } = useAppTranslation();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="ui-panel-frame relative isolate flex flex-col items-center gap-5 overflow-hidden px-6 py-12 text-center">
        <div
          aria-hidden
          className="absolute inset-x-[15%] top-0 -z-10 h-px bg-linear-to-r from-transparent via-ui-gold/40 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,rgb(143_30_22/0.25),transparent_55%)]"
        />
        <h2 className="font-display text-xl font-bold tracking-widest text-ui-text-bright uppercase sm:text-2xl">
          {t("landing.callToAction.title")}
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-ui-text">
          {t("landing.callToAction.subtitle")}
        </p>
        <ButtonLink href="/play" variant="primary" className="h-12 px-8 text-base">
          {t("landing.callToAction.cta")}
        </ButtonLink>
      </div>
    </section>
  );
}
