"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatAffixRange } from "../../lib/wiki/formatAffixRange";
import { isAffixOnGrade } from "../../lib/wiki/isAffixOnGrade";
import { WIKI_AFFIX_GUIDE } from "../../lib/wiki/wikiAffixGuide";
import { WIKI_RARITY_GUIDE } from "../../lib/wiki/wikiRarityGuide";

/**
 * Tailwind needs literal class strings, so each rarity carries its color
 * (same pattern as ItemTooltip).
 */
const RARITY_TEXT = {
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
} as const;

export function AffixGuideTable() {
  const { t } = useAppTranslation();

  return (
    <section className="ui-panel-frame relative overflow-hidden">
      <header className="border-b border-ui-stone-light/15 bg-black/35 px-5 py-4">
        <h2 className="font-display text-lg font-bold tracking-wide text-ui-text-bright uppercase">
          {t("websiteWikiItems.affixes.title")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-ui-muted">
          {t("websiteWikiItems.affixes.description")}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-ui-stone-light/15 bg-black/25 text-left">
              <th
                scope="col"
                className="px-5 py-3 font-display text-xs font-bold tracking-wide text-ui-gold uppercase"
              >
                {t("websiteWikiItems.affixes.affix")}
              </th>
              {WIKI_RARITY_GUIDE.map((grade) => (
                <th
                  key={grade.rarity}
                  scope="col"
                  className={`px-4 py-3 font-display text-xs font-bold tracking-wide uppercase ${RARITY_TEXT[grade.rarity]}`}
                >
                  {t(`itemTooltip.rarity.${grade.rarity}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-stone-light/10">
            {WIKI_AFFIX_GUIDE.map((entry) => (
              <tr key={entry.id}>
                <th scope="row" className="px-5 py-3 text-left font-normal">
                  <span className="text-ui-text-bright">{entry.name}</span>
                  {entry.noteKey && (
                    <span className="mt-0.5 block max-w-60 text-xs leading-5 text-ui-muted">
                      {t(`websiteWikiItems.affixes.notes.${entry.noteKey}`)}
                    </span>
                  )}
                </th>
                {WIKI_RARITY_GUIDE.map((grade) => (
                  <td
                    key={grade.rarity}
                    className="px-4 py-3 align-top tabular-nums"
                  >
                    {isAffixOnGrade(entry, grade.rarity) ? (
                      <span className="whitespace-nowrap text-ui-success-light">
                        {formatAffixRange(entry, grade.valueMultiplier)}
                      </span>
                    ) : (
                      <>
                        <span aria-hidden className="text-ui-muted">
                          —
                        </span>
                        <span className="sr-only">
                          {t("websiteWikiItems.affixes.unavailable")}
                        </span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
