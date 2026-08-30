"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

const SECTIONS = ["formula", "goal", "balance"] as const;

export function PvpWikiPage() {
  const { t } = useAppTranslation();

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <header className="portal-box portal-box-warm overflow-hidden p-5 sm:p-6">
          <p className="font-display text-[0.6875rem] font-normal tracking-[0.24em] text-[#a8524c] uppercase">
            {t("websiteWikiPvp.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
            {t("websiteWikiPvp.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ui-muted">
            {t("websiteWikiPvp.description")}
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section
            key={section}
            className="portal-box overflow-hidden p-5 sm:p-6"
          >
            <h2 className="font-display text-xl font-semibold tracking-wide text-[#f2ece2]">
              {t(`websiteWikiPvp.sections.${section}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-ui-text">
              {t(`websiteWikiPvp.sections.${section}.body`)}
            </p>
          </section>
        ))}
      </div>
    </PublicSiteLayout>
  );
}
