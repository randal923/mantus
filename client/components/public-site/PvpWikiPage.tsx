"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

const SECTIONS = ["formula", "goal", "balance"] as const;

export function PvpWikiPage() {
  const { t } = useAppTranslation();

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <header className="ui-panel-frame relative overflow-hidden p-5 sm:p-6">
          <p className="font-display text-xs font-bold tracking-widest text-ui-accent-light uppercase">
            {t("websiteWikiPvp.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase">
            {t("websiteWikiPvp.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ui-muted">
            {t("websiteWikiPvp.description")}
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section
            key={section}
            className="ui-panel-frame relative overflow-hidden p-5 sm:p-6"
          >
            <h2 className="font-display text-lg font-bold tracking-wide text-ui-text-bright uppercase">
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
