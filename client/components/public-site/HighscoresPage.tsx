"use client";

import {
  CHARACTER_VOCATIONS,
  HIGHSCORE_CATEGORIES,
  publicHighscoresDataSchema,
  type CharacterVocation,
  type HighscoreCategory,
} from "@tibia/protocol";
import Link from "next/link";
import { useState } from "react";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function HighscoresPage() {
  const { t } = useAppTranslation();
  const [category, setCategory] =
    useState<HighscoreCategory>("experience");
  const [vocation, setVocation] = useState<CharacterVocation | "all">("all");
  const [page, setPage] = useState(0);
  const search = new URLSearchParams({
    category,
    page: String(page),
  });
  if (vocation !== "all") search.set("vocation", vocation);
  const ranking = usePublicApiData(
    `/api/public/highscores?${search.toString()}`,
    publicHighscoresDataSchema,
  );

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <aside className="ui-panel-frame relative h-fit overflow-hidden p-5">
          <h2 className="font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
            {t("websiteHighscores.filters")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Dropdown<HighscoreCategory>
              ariaLabel={t("websiteHighscores.category")}
              label={t("websiteHighscores.category")}
              value={category}
              options={HIGHSCORE_CATEGORIES.map((entry) => ({
                value: entry,
                label: t(`websiteHighscores.categories.${entry}`),
              }))}
              onChange={(value) => {
                setCategory(value);
                setPage(0);
              }}
            />
            <Dropdown<CharacterVocation | "all">
              ariaLabel={t("websiteHighscores.vocation")}
              label={t("websiteHighscores.vocation")}
              value={vocation}
              options={[
                {
                  value: "all",
                  label: t("websiteHighscores.allVocations"),
                },
                ...CHARACTER_VOCATIONS.map((entry) => ({
                  value: entry,
                  label: t(`vocations.${entry}.name`),
                })),
              ]}
              onChange={(value) => {
                setVocation(value);
                setPage(0);
              }}
            />
          </div>
          <p className="mt-5 border-t border-ui-stone-light/15 pt-4 text-xs leading-5 text-ui-muted">
            {t("websiteHighscores.updateNote")}
          </p>
        </aside>

        <section className="ui-panel-frame relative min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-black/30 px-5 py-4">
            <div>
              <h2 className="font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
                {t(`websiteHighscores.categories.${category}`)}
              </h2>
              <p className="mt-1 text-xs text-ui-muted">
                {vocation === "all"
                  ? t("websiteHighscores.allVocations")
                  : t(`vocations.${vocation}.name`)}
              </p>
            </div>
            {ranking.data && (
              <p className="text-xs text-ui-muted">
                {t("websiteHighscores.page", {
                  current: ranking.data.page + 1,
                  total: ranking.data.totalPages,
                })}
              </p>
            )}
          </div>

          {ranking.status === "loading" && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("common.loading")}…
            </p>
          )}
          {ranking.status === "unavailable" && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("publicSite.unavailable")}
            </p>
          )}
          {ranking.data && ranking.data.entries.length === 0 && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("websiteHighscores.empty")}
            </p>
          )}
          {ranking.data && ranking.data.entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-2xl border-collapse text-left text-sm">
                <thead className="border-b border-ui-stone-light/15 bg-white/3 text-xs tracking-wide text-ui-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.rank")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.name")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.vocation")}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {t("websiteHighscores.level")}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {t("websiteHighscores.value")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-stone-light/10">
                  {ranking.data.entries.map((entry) => (
                    <tr
                      key={`${entry.rank}-${entry.name}`}
                      className="transition-colors hover:bg-white/3"
                    >
                      <td className="px-5 py-3 font-display font-bold text-ui-gold">
                        {entry.rank}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/characters/${encodeURIComponent(entry.name)}`}
                          className="font-medium text-ui-text-bright hover:text-ui-accent-light"
                        >
                          {entry.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ui-text">
                        {t(`vocations.${entry.vocation}.name`)}
                      </td>
                      <td className="px-5 py-3 text-right text-ui-text">
                        {entry.level.toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-ui-text-bright">
                        {BigInt(entry.value).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ranking.data && (
            <div className="flex items-center justify-between border-t border-ui-stone-light/15 px-5 py-4">
              <Button
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t("websiteHighscores.previous")}
              </Button>
              <span className="text-xs text-ui-muted">
                {t("websiteHighscores.page", {
                  current: ranking.data.page + 1,
                  total: ranking.data.totalPages,
                })}
              </span>
              <Button
                size="sm"
                disabled={page + 1 >= ranking.data.totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(ranking.data.totalPages - 1, current + 1),
                  )
                }
              >
                {t("websiteHighscores.next")}
              </Button>
            </div>
          )}
        </section>
      </div>
    </PublicSiteLayout>
  );
}
